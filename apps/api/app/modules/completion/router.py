from typing import Annotated

from fastapi import APIRouter, Depends, Header

from app.core.dependencies import Container, get_container
from app.core.security import Actor, consented_actor
from app.modules.completion.models import CompletionRequest, CompletionResponse
from app.platform.records import policy_from_headers

router = APIRouter(prefix="/completion", tags=["completion"])


@router.post("/completions", response_model=CompletionResponse, status_code=200)
async def create_completion(
    request: CompletionRequest,
    actor: Annotated[Actor, Depends(consented_actor)],
    container: Annotated[Container, Depends(get_container)],
    save_history: Annotated[str | None, Header(alias="X-Save-History")] = None,
    improvement_consent: Annotated[str | None, Header(alias="X-Improvement-Consent")] = None,
) -> CompletionResponse:
    result = await container.completion.complete(
        request,
        actor.user_id,
        policy_from_headers(save_history, improvement_consent),
    )
    return CompletionResponse.model_validate(result)
