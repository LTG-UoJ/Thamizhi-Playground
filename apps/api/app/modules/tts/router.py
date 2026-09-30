import hashlib
import io
import wave
import hashlib
import io
import wave
import hashlib
import io
import wave
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Header, HTTPException, UploadFile

from app.core.dependencies import Container, get_container
from app.core.security import Actor, consented_actor
from app.modules.tts.models import JobAccepted, TTSRequest
from app.platform.records import policy_from_headers

router = APIRouter(prefix="/tts", tags=["tts"])


@router.post("/jobs", response_model=JobAccepted, status_code=202)
async def create_tts_job(
    request: TTSRequest,
    background: BackgroundTasks,
    actor: Annotated[Actor, Depends(consented_actor)],
    container: Annotated[Container, Depends(get_container)],
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=200)],
    save_history: Annotated[str | None, Header(alias="X-Save-History")] = None,
    improvement_consent: Annotated[str | None, Header(alias="X-Improvement-Consent")] = None,
) -> dict[str, str]:
    route = "POST:/tts/jobs"
    fingerprint = container.idempotency.fingerprint(request.model_dump())
    replay = await container.idempotency.reserve(actor.user_id, route, idempotency_key, fingerprint)
    if replay:
        return replay
    try:
        response = await container.tts.create(
            request,
            actor.user_id,
            background,
            policy_from_headers(save_history, improvement_consent),
        )
        await container.idempotency.complete(actor.user_id, route, idempotency_key, response)
        return response
    except Exception:
        await container.idempotency.forget(actor.user_id, route, idempotency_key)
        raise


@router.post("/jobs/upload", response_model=JobAccepted, status_code=202)
async def create_tts_job_with_reference(
    background: BackgroundTasks,
    actor: Annotated[Actor, Depends(consented_actor)],
    container: Annotated[Container, Depends(get_container)],
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=200)],
    text: Annotated[str, Form(min_length=1, max_length=2000)],
    reference_wav: UploadFile = File(...),
    language: Annotated[str, Form()] = "ta-LK",
    voice: Annotated[str, Form()] = "male",
    save_history: Annotated[str | None, Header(alias="X-Save-History")] = None,
    improvement_consent: Annotated[str | None, Header(alias="X-Improvement-Consent")] = None,
) -> dict[str, str]:
    request = TTSRequest(text=text, language=language, voice=voice)
    audio = await reference_wav.read(10 * 1024 * 1024 + 1)
    await reference_wav.close()
    if len(audio) > 10 * 1024 * 1024:
        raise HTTPException(413, "Reference WAV must be at most 10 MiB.")
    try:
        with wave.open(io.BytesIO(audio), "rb") as wav:
            if wav.getnframes() == 0 or wav.getnchannels() not in (1, 2):
                raise ValueError("Empty or unsupported WAV")
    except (wave.Error, EOFError, ValueError):
        raise HTTPException(422, "Upload a valid PCM WAV file.") from None

    route = "POST:/tts/jobs/upload"
    fingerprint = container.idempotency.fingerprint({
        **request.model_dump(),
        "reference_sha256": hashlib.sha256(audio).hexdigest(),
    })
    replay = await container.idempotency.reserve(
        actor.user_id, route, idempotency_key, fingerprint
    )
    if replay:
        return replay
    try:
        response = await container.tts.create(
            request,
            actor.user_id,
            background,
            policy_from_headers(save_history, improvement_consent),
            reference_wav=audio,
        )
        await container.idempotency.complete(
            actor.user_id, route, idempotency_key, response
        )
        return response
    except Exception:
        await container.idempotency.forget(
            actor.user_id, route, idempotency_key
        )
        raise


@router.get("/jobs/{job_id}")
async def get_tts_job(
    job_id: str,
    actor: Annotated[Actor, Depends(consented_actor)],
    container: Annotated[Container, Depends(get_container)],
) -> dict[str, object]:
    return await container.jobs.get(job_id, actor.user_id)
