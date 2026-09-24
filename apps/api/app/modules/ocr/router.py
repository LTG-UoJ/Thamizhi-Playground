import hashlib
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Header, UploadFile

from app.core.dependencies import Container, get_container
from app.core.errors import DomainError
from app.core.security import Actor, consented_actor
from app.modules.ocr.models import OCRJobAccepted
from app.platform.records import policy_from_headers

router = APIRouter(prefix="/ocr", tags=["ocr"])


@router.post("/jobs", response_model=OCRJobAccepted, status_code=202)
async def create_ocr_job(
    background: BackgroundTasks,
    actor: Annotated[Actor, Depends(consented_actor)],
    container: Annotated[Container, Depends(get_container)],
    image: Annotated[UploadFile, File()],
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=200)],
    language: Annotated[str, Form()] = "en",
    save_history: Annotated[str | None, Header(alias="X-Save-History")] = None,
    improvement_consent: Annotated[str | None, Header(alias="X-Improvement-Consent")] = None,
) -> dict[str, str]:
    if language not in {"en", "ta-LK"}:
        raise DomainError("VALIDATION_ERROR", "Unsupported language.", 400)
    data = await image.read(15 * 1024 * 1024 + 1)
    media_type = image.content_type or "application/octet-stream"
    request_fingerprint = {
        "sha256": hashlib.sha256(data).hexdigest(),
        "language": language,
        "media_type": media_type,
    }
    route = "POST:/ocr/jobs"
    fingerprint = container.idempotency.fingerprint(request_fingerprint)
    replay = await container.idempotency.reserve(actor.user_id, route, idempotency_key, fingerprint)
    if replay:
        return replay
    try:
        response = await container.ocr.create(
            image=data,
            language=language,
            media_type=media_type,
            owner_id=actor.user_id,
            background=background,
            policy=policy_from_headers(save_history, improvement_consent),
        )
        await container.idempotency.complete(actor.user_id, route, idempotency_key, response)
        return response
    except Exception:
        await container.idempotency.forget(actor.user_id, route, idempotency_key)
        raise


@router.get("/jobs/{job_id}")
async def get_ocr_job(
    job_id: str,
    actor: Annotated[Actor, Depends(consented_actor)],
    container: Annotated[Container, Depends(get_container)],
) -> dict[str, object]:
    return await container.jobs.get(job_id, actor.user_id)
