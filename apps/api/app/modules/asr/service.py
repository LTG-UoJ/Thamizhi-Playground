import asyncio
from dataclasses import dataclass
from typing import Protocol
from uuid import uuid4

import httpx

from app.core.config import Settings
from app.core.errors import DomainError
from app.platform.admission import AdmissionController
from app.platform.audit import AuditStore
from app.platform.jobs import JobStore
from app.platform.records import RecordingPolicy, RecordStore


class ASRProvider(Protocol):
    provider_id: str

    async def transcribe(self, audio: bytes, language: str) -> dict[str, object]: ...


class MockASRProvider:
    provider_id = "mock-asr"

    async def transcribe(self, audio: bytes, language: str) -> dict[str, object]:
        seconds = round(len(audio) / 32_000, 1)
        if language == "ta-LK":
            text = f"சோதனை ஒலிப்பதிவு பெறப்பட்டது ({seconds} விநாடிகள்)."
        else:
            text = f"Test audio received ({seconds} seconds)."
        return {"text": text, "language": language, "confidence": 0.5}


class ExternalASRProvider:
    provider_id = "external-asr"

    def __init__(self, upload_url: str, ws_url: str) -> None:
        self.upload_url = upload_url
        self.ws_url = ws_url

    async def transcribe(self, audio: bytes, language: str) -> dict[str, object]:
        """Send audio to the external ASR service /upload endpoint.

        The upload URL is used exactly as configured (e.g. already contains
        ``?lang=ta``). No additional query parameters are appended.
        """
        url_with_lang = self.upload_url

        if audio.startswith(b"RIFF"):
            filename = "audio.wav"
            content_type = "audio/wav"
        elif audio.startswith(b"\x1a\x45\xdf\xa3"):
            filename = "recording.webm"
            content_type = "audio/webm"
        elif audio.startswith(b"OggS"):
            filename = "audio.ogg"
            content_type = "audio/ogg"
        elif audio.startswith(b"ID3") or audio.startswith(b"\xff\xfb"):
            filename = "audio.mp3"
            content_type = "audio/mp3"
        else:
            filename = "audio.wav"
            content_type = "application/octet-stream"

        try:
            files = {"file": (filename, audio, content_type)}
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url_with_lang, files=files)
        except httpx.TimeoutException as exc:
            raise DomainError(
                "PROVIDER_TIMEOUT",
                "The external ASR service timed out.",
                504,
                True,
            ) from exc
        except httpx.RequestError as exc:
            raise DomainError(
                "PROVIDER_UNAVAILABLE",
                f"Unable to reach the external ASR service at {self.upload_url}.",
                502,
                True,
            ) from exc

        if response.status_code != 200:
            raise DomainError(
                "PROVIDER_FAILURE",
                f"External ASR service returned HTTP {response.status_code}.",
                502,
                True,
            )

        try:
            payload = response.json()
        except Exception as exc:
            raise DomainError(
                "PROVIDER_FAILURE",
                "Malformed response from external ASR service.",
                502,
                True,
            ) from exc

        transcription = payload.get("transcription")
        if transcription is None:
            transcription = payload.get("text", "")

        return {
            "text": str(transcription),
            "language": str(payload.get("detected_language") or language),
            "confidence": float(payload.get("confidence", 1.0)) if payload.get("confidence") is not None else None,
            "duration_seconds": payload.get("duration_seconds"),
        }


def build_asr_provider(settings: Settings) -> ASRProvider:
    if settings.asr_provider == "mock":
        return MockASRProvider()
    if settings.asr_provider == "external":
        return ExternalASRProvider(settings.asr_upload_url, settings.asr_ws_url)
    raise RuntimeError(f"Unsupported ASR provider: {settings.asr_provider}")


@dataclass(slots=True)
class LiveSession:
    session_id: str
    owner_id: str
    language: str
    status: str = "ready"


class ASRService:
    def __init__(
        self,
        provider: ASRProvider,
        jobs: JobStore,
        admission: AdmissionController,
        audit: AuditStore,
        records: RecordStore,
    ) -> None:
        self.provider = provider
        self.jobs = jobs
        self.admission = admission
        self.audit = audit
        self.records = records
        self._sessions: dict[str, LiveSession] = {}
        self._lock = asyncio.Lock()

    async def create_session(self, owner_id: str, language: str) -> dict[str, str]:
        session = LiveSession(str(uuid4()), owner_id, language)
        async with self._lock:
            self._sessions[session.session_id] = session
        return {
            "session_id": session.session_id,
            "status": session.status,
            "stream_url": f"/api/v1/asr/sessions/{session.session_id}/stream",
            "provider_id": self.provider.provider_id,
        }

    async def get_session(self, session_id: str, owner_id: str) -> LiveSession:
        async with self._lock:
            session = self._sessions.get(session_id)
        if not session or session.owner_id != owner_id:
            raise DomainError("NOT_FOUND", "ASR session not found.", 404)
        return session

    async def get_session_by_id(self, session_id: str) -> LiveSession:
        async with self._lock:
            session = self._sessions.get(session_id)
        if not session:
            raise DomainError("NOT_FOUND", "ASR session not found.", 404)
        return session

    async def transcribe(
        self,
        owner_id: str,
        audio: bytes,
        language: str,
        policy: RecordingPolicy | None = None,
    ) -> dict[str, object]:
        policy = policy or RecordingPolicy()
        if not audio:
            raise DomainError("VALIDATION_ERROR", "Audio is empty.", 400)
        if len(audio) > 25 * 1024 * 1024:
            raise DomainError("PAYLOAD_TOO_LARGE", "Audio exceeds 25 MiB.", 413)
        async with self.admission.admit("asr"):
            result = await self.provider.transcribe(audio, language)
        await self.audit.record(
            actor_id=owner_id,
            action="asr.transcribe",
            target_type="transcript",
            target_id=str(uuid4()),
            outcome="completed",
        )
        interaction_id = await self.records.create_interaction(
            user_id=owner_id,
            module_id="asr",
            query_text=f"Audio submission ({len(audio)} bytes)",
            answer_text=str(result["text"]),
            provider_id=self.provider.provider_id,
            model_id=None,
            language=language,
            policy=policy,
        )
        return {
            **result,
            "provider_id": self.provider.provider_id,
            "interaction_id": interaction_id,
        }
