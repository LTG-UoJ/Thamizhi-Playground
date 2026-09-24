import asyncio
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Protocol

from fastapi import BackgroundTasks

from app.core.config import Settings
from app.core.errors import DomainError
from app.platform.admission import AdmissionController
from app.platform.audit import AuditStore
from app.platform.jobs import JobStore
from app.platform.records import RecordingPolicy, RecordStore


class OCRProvider(Protocol):
    provider_id: str

    async def recognise(
        self, image: bytes, language: str, media_type: str
    ) -> dict[str, object]: ...


class MockOCRProvider:
    provider_id = "mock-ocr"

    async def recognise(self, image: bytes, language: str, media_type: str) -> dict[str, object]:
        text = "சோதனைப் படம் பெறப்பட்டது." if language == "ta-LK" else "Test image received."
        return {
            "text": text,
            "language": language,
            "blocks": [
                {
                    "text": text,
                    "confidence": 0.5,
                    "polygon": [[0.05, 0.05], [0.95, 0.05], [0.95, 0.2], [0.05, 0.2]],
                }
            ],
        }


class TesseractOCRProvider:
    provider_id = "tesseract-local"

    def __init__(self, command: str) -> None:
        self.command = command

    async def recognise(self, image: bytes, language: str, media_type: str) -> dict[str, object]:
        if not shutil.which(self.command):
            raise DomainError("PROVIDER_UNAVAILABLE", "Tesseract is not installed.", 503, True)
        suffix = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}[media_type]

        def run() -> str:
            with tempfile.TemporaryDirectory() as directory:
                source = Path(directory) / f"input{suffix}"
                source.write_bytes(image)
                language_code = "tam" if language == "ta-LK" else "eng"
                result = subprocess.run(
                    [self.command, str(source), "stdout", "-l", language_code],
                    check=True,
                    timeout=60,
                    capture_output=True,
                    text=True,
                )
                return result.stdout.strip()

        try:
            text = await asyncio.to_thread(run)
        except (subprocess.SubprocessError, OSError) as exc:
            raise DomainError("PROVIDER_FAILURE", "OCR processing failed.", 502, True) from exc
        return {
            "text": text,
            "language": language,
            "blocks": [
                {
                    "text": text,
                    "confidence": None,
                    "polygon": [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]],
                }
            ],
        }


def build_ocr_provider(settings: Settings) -> OCRProvider:
    if settings.ocr_provider == "mock":
        return MockOCRProvider()
    if settings.ocr_provider == "tesseract":
        return TesseractOCRProvider(settings.tesseract_command)
    raise RuntimeError(f"Unsupported OCR provider: {settings.ocr_provider}")


class OCRService:
    def __init__(
        self,
        provider: OCRProvider,
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

    async def create(
        self,
        *,
        image: bytes,
        language: str,
        media_type: str,
        owner_id: str,
        background: BackgroundTasks,
        policy: RecordingPolicy,
    ) -> dict[str, str]:
        if media_type not in {"image/png", "image/jpeg", "image/webp"}:
            raise DomainError("UNSUPPORTED_MEDIA_TYPE", "Use PNG, JPEG, or WebP.", 415)
        if not image:
            raise DomainError("VALIDATION_ERROR", "Image is empty.", 400)
        if len(image) > 15 * 1024 * 1024:
            raise DomainError("PAYLOAD_TOO_LARGE", "Image exceeds 15 MiB.", 413)
        job = await self.jobs.create("ocr", owner_id)
        background.add_task(
            self._run, job.job_id, owner_id, image, language, media_type, policy
        )
        return {
            "job_id": job.job_id,
            "status": job.status,
            "status_url": f"/api/v1/ocr/jobs/{job.job_id}",
        }

    async def _run(
        self,
        job_id: str,
        owner_id: str,
        image: bytes,
        language: str,
        media_type: str,
        policy: RecordingPolicy,
    ) -> None:
        try:
            async with self.admission.admit("ocr"):
                await self.jobs.set_running(job_id)
                result = await self.provider.recognise(image, language, media_type)
                result["provider_id"] = self.provider.provider_id
                interaction_id = await self.records.create_interaction(
                    interaction_id=job_id,
                    user_id=owner_id,
                    module_id="ocr",
                    query_text=f"Image submission ({len(image)} bytes; {media_type})",
                    answer_text=str(result["text"]),
                    provider_id=self.provider.provider_id,
                    model_id=None,
                    language=language,
                    policy=policy,
                )
                if interaction_id:
                    result["interaction_id"] = interaction_id
                await self.jobs.complete(job_id, result)
                await self.audit.record(
                    actor_id=owner_id,
                    action="ocr.recognise",
                    target_type="job",
                    target_id=job_id,
                    outcome="completed",
                )
        except DomainError as exc:
            await self.jobs.fail(job_id, exc.code, exc.message)
        except Exception:  # noqa: BLE001 - worker boundary converts failures to typed job state
            await self.jobs.fail(job_id, "INTERNAL_ERROR", "OCR job failed.")
