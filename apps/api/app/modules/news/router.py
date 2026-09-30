from typing import Annotated

from fastapi import APIRouter, Depends, Header

from app.core.dependencies import Container, get_container
from app.core.security import Actor, current_actor
from app.modules.news.models import (
    NewsClassificationRequest,
    NewsClassificationResponse,
    NewsHeadlineRequest,
    NewsHeadlineResponse,
)
from app.platform.records import policy_from_headers

router = APIRouter(prefix="/news", tags=["news"])


@router.post("/classify", response_model=NewsClassificationResponse, status_code=200)
async def classify_news(
    request: NewsClassificationRequest,
    actor: Annotated[Actor, Depends(current_actor)],
    container: Annotated[Container, Depends(get_container)],
    save_history: Annotated[str | None, Header(alias="X-Save-History")] = None,
    improvement_consent: Annotated[str | None, Header(alias="X-Improvement-Consent")] = None,
) -> NewsClassificationResponse:
    result = await container.news.classify(
        text=request.text,
        owner_id=actor.user_id,
        policy=policy_from_headers(save_history, improvement_consent),
    )
    return NewsClassificationResponse.model_validate(result)


@router.post("/generate-headline", response_model=NewsHeadlineResponse, status_code=200)
async def generate_headline(
    request: NewsHeadlineRequest,
    actor: Annotated[Actor, Depends(current_actor)],
    container: Annotated[Container, Depends(get_container)],
    save_history: Annotated[str | None, Header(alias="X-Save-History")] = None,
    improvement_consent: Annotated[str | None, Header(alias="X-Improvement-Consent")] = None,
) -> NewsHeadlineResponse:
    result = await container.news.generate_headline(
        text=request.text,
        owner_id=actor.user_id,
        policy=policy_from_headers(save_history, improvement_consent),
    )
    return NewsHeadlineResponse.model_validate(result)
