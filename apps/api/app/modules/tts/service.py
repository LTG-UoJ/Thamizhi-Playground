import asyncio
import io
import math
import shutil
import struct
import subprocess
import tempfile
import wave
from collections.abc import Callable
from typing import Protocol

from fastapi import BackgroundTasks

from app.core.config import Settings
from app.core.errors import DomainError
from app.modules.tts.models import TTSRequest
from app.platform.admission import AdmissionController
from app.platform.artifacts import ArtifactStore
from app.platform.audit import AuditStore
from app.platform.jobs import JobStore
from app.platform.records import RecordingPolicy, RecordStore


class TTSProvider(Protocol):
    provider_id: str

    async def synthesize(self, request: TTSRequest) -> bytes: ...


class MockTTSProvider:
    provider_id = "mock-tts"

    async def synthesize(self, request: TTSRequest) -> bytes:
        sample_rate = 16_000
        duration = min(4.0, max(0.5, len(request.text) / 45))
        base = 220 if request.language == "en" else 260
        frames = bytearray()
        for index in range(int(sample_rate * duration)):
            envelope = min(1.0, index / 800, (sample_rate * duration - index) / 800)
            value = int(7_000 * envelope * math.sin(2 * math.pi * base * index / sample_rate))
            frames.extend(struct.pack("<h", value))
        output = io.BytesIO()
        with wave.open(output, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(sample_rate)
            wav.writeframes(bytes(frames))
        return output.getvalue()


class EspeakTTSProvider:
    provider_id = "espeak-tts"

    def __init__(self, command: str) -> None:
        self.command = command

    async def synthesize(self, request: TTSRequest) -> bytes:
        if not shutil.which(self.command):
            raise DomainError("PROVIDER_UNAVAILABLE", "eSpeak is not installed.", 503, True)

        def run() -> bytes:
            with tempfile.NamedTemporaryFile(suffix=".wav") as output:
                voice = "ta" if request.language == "ta-LK" else "en"
                speed = int(175 * request.speaking_rate)
                subprocess.run(
                    [self.command, "-v", voice, "-s", str(speed), "-w", output.name, request.text],
                    check=True,
                    timeout=30,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE,
                )
                return output.read()

        try:
            return await asyncio.to_thread(run)
        except (subprocess.SubprocessError, OSError) as exc:
            raise DomainError("PROVIDER_FAILURE", "TTS synthesis failed.", 502, True) from exc


def build_tts_provider(settings: Settings) -> TTSProvider:
    providers: dict[str, Callable[[], TTSProvider]] = {
        "mock": MockTTSProvider,
        "espeak": lambda: EspeakTTSProvider(settings.espeak_command),
    }
    try:
        return providers[settings.tts_provider]()
    except KeyError as exc:
        raise RuntimeError(f"Unsupported TTS provider: {settings.tts_provider}") from exc


class TTSService:
    def __init__(
        self,
        provider: TTSProvider,
        jobs: JobStore,
        artifacts: ArtifactStore,
        admission: AdmissionController,
        audit: AuditStore,
        records: RecordStore,
    ) -> None:
        self.provider = provider
        self.jobs = jobs
        self.artifacts = artifacts
        self.admission = admission
        self.audit = audit
        self.records = records

    async def create(
        self,
        request: TTSRequest,
        owner_id: str,
        background: BackgroundTasks,
        policy: RecordingPolicy,
    ) -> dict[str, str]:
        job = await self.jobs.create("tts", owner_id)
        background.add_task(self._run, job.job_id, owner_id, request, policy)
        return {
            "job_id": job.job_id,
            "status": job.status,
            "status_url": f"/api/v1/tts/jobs/{job.job_id}",
        }

    async def _run(
        self, job_id: str, owner_id: str, request: TTSRequest, policy: RecordingPolicy
    ) -> None:
        try:
            async with self.admission.admit("tts"):
                await self.jobs.set_running(job_id)
                audio = await self.provider.synthesize(request)
                artifact_id = await self.artifacts.put(audio, ".wav")
                result = {
                    "artifact_url": f"/api/v1/artifacts/{artifact_id}",
                    "media_type": "audio/wav",
                    "provider_id": self.provider.provider_id,
                    "language": request.language,
                }
                interaction_id = await self.records.create_interaction(
                    interaction_id=job_id,
                    user_id=owner_id,
                    module_id="tts",
                    query_text=request.text,
                    answer_text=f"Generated WAV artifact {artifact_id}",
                    provider_id=self.provider.provider_id,
                    model_id=None,
                    language=request.language,
                    policy=policy,
                )
                if interaction_id:
                    result["interaction_id"] = interaction_id
                await self.jobs.complete(job_id, result)
                await self.audit.record(
                    actor_id=owner_id,
                    action="tts.synthesize",
                    target_type="job",
                    target_id=job_id,
                    outcome="completed",
                )
        except DomainError as exc:
            await self.jobs.fail(job_id, exc.code, exc.message)
        except Exception:  # noqa: BLE001 - worker boundary converts failures to typed job state
            await self.jobs.fail(job_id, "INTERNAL_ERROR", "TTS job failed.")
