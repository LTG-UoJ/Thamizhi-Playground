from typing import Annotated

from fastapi import Request, APIRouter, Depends, Header

from app.core.dependencies import Container, get_container
from app.core.security import Actor, consented_actor
from app.modules.completion.models import CompletionRequest, CompletionResponse
from app.platform.records import policy_from_headers

router = APIRouter(prefix="/completion", tags=["completion"])


@router.post("/completions", response_model=CompletionResponse, status_code=200)
async def create_completion(
    http_request: Request,
    request: CompletionRequest,
    actor: Annotated[Actor, Depends(consented_actor)],
    container: Annotated[Container, Depends(get_container)],
    save_history: Annotated[str | None, Header(alias="X-Save-History")] = None,
    improvement_consent: Annotated[str | None, Header(alias="X-Improvement-Consent")] = None,
    admin_history_consent: Annotated[str | None, Header(alias="X-Admin-History-Consent")] = None,
    admin_consent_version: Annotated[str | None, Header(alias="X-Admin-Consent-Version")] = None,
) -> CompletionResponse:
    result = await container.completion.complete(
        request,
        actor.user_id,
        policy_from_headers(
                save_history,
                improvement_consent,
                (
                    admin_history_consent
                    if await container.records.has_history_save_consent(actor.user_id)
                    else None
                ),
                admin_consent_version,
            ),
    )
    if result.get("interaction_id"):
        http_request.state.interaction_id = result["interaction_id"]
    return CompletionResponse.model_validate(result)
