import asyncio
import json
from collections.abc import AsyncIterator
from typing import Annotated, cast

from fastapi import APIRouter, Depends, Header
from fastapi.responses import StreamingResponse

from app.core.dependencies import Container, get_container
from app.core.security import Actor, consented_actor
from app.modules.chat.models import ChatRequest, ChatResponse
from app.platform.records import policy_from_headers

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/completions", response_model=None)
async def create_chat_completion(
    request: ChatRequest,
    actor: Annotated[Actor, Depends(consented_actor)],
    container: Annotated[Container, Depends(get_container)],
    save_history: Annotated[str | None, Header(alias="X-Save-History")] = None,
    improvement_consent: Annotated[str | None, Header(alias="X-Improvement-Consent")] = None,
) -> ChatResponse | StreamingResponse:
    result = await container.chat.complete(
        request,
        actor.user_id,
        policy_from_headers(save_history, improvement_consent),
    )
    if not request.stream:
        return ChatResponse.model_validate(result)

    async def events() -> AsyncIterator[str]:
        metadata = {
            "request_id": result["request_id"],
            "model_id": result["model_id"],
            "provider_id": result["provider_id"],
        }
        yield f"event: metadata\ndata: {json.dumps(metadata)}\n\n"
        message = cast(dict[str, str], result["message"])
        content = message["content"]
        for token in str(content).split():
            yield f"event: token\ndata: {json.dumps({'text': token + ' '})}\n\n"
            await asyncio.sleep(0)
        yield 'event: completed\ndata: {"finish_reason":"stop"}\n\n'

    return StreamingResponse(events(), media_type="text/event-stream")
