from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field

from app.core.dependencies import Container, get_container
from app.core.security import Actor, consented_actor
from app.platform.records import policy_from_headers

router = APIRouter(prefix="/api/v1/ocr", tags=["OCR Audit"])


class OCRAuditRequest(BaseModel):
    filename: str = Field(max_length=255)
    output_text: str | None = Field(default=None, max_length=100000)
    status_code: int = Field(ge=100, le=599)
    latency_ms: float = Field(ge=0)


@router.post("/audit")
async def audit_ocr(
    payload: OCRAuditRequest,
    actor: Annotated[Actor, Depends(consented_actor)],
    container: Annotated[Container, Depends(get_container)],
    save_history: Annotated[
        str | None, Header(alias="X-Save-History")
    ] = None,
    improvement_consent: Annotated[
        str | None, Header(alias="X-Improvement-Consent")
    ] = None,
    admin_history_consent: Annotated[str | None, Header(alias="X-Admin-History-Consent")] = None,
    admin_consent_version: Annotated[str | None, Header(alias="X-Admin-Consent-Version")] = None,
):
    policy = policy_from_headers(
                save_history,
                improvement_consent,
                (
                    admin_history_consent
                    if await container.records.has_history_save_consent(actor.user_id)
                    else None
                ),
                admin_consent_version,
            )

    interaction_id = await container.records.create_interaction(
        user_id=actor.user_id,
        module_id="ocr",
        query_text=payload.filename,
        answer_text=payload.output_text,
        provider_id="thamizhi-ocr",
        model_id=None,
        language="ta",
        policy=policy,
        status=(
            "completed"
            if payload.status_code < 400
            else "failed"
        ),
    )

    await container.records.record_access(
        user_id=actor.user_id,
        method="POST",
        route="/api/v1/ocr/process",
        status_code=payload.status_code,
        latency_ms=payload.latency_ms,
        request_id=str(uuid4()),
        interaction_id=interaction_id,
    )

    return {
        "recorded": True,
        "interaction_id": interaction_id,
    }
