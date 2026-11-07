from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.dependencies import Container, get_container
from app.core.security import Actor, current_actor

router = APIRouter(
    prefix="/history-preferences",
    tags=["Privacy"],
)


class HistoryPreferencesRequest(BaseModel):
    save_history: bool


@router.get("")
async def get_preferences(
    actor: Annotated[Actor, Depends(current_actor)],
    container: Annotated[Container, Depends(get_container)],
):
    enabled = await container.records.has_history_save_consent(
        actor.user_id
    )
    return {
        "save_history": enabled,
        "version": "history-save-v2",
    }


@router.post("")
async def update_preferences(
    payload: HistoryPreferencesRequest,
    actor: Annotated[Actor, Depends(current_actor)],
    container: Annotated[Container, Depends(get_container)],
):
    await container.records.set_history_save_consent(
        actor.user_id, payload.save_history
    )
    return {
        "save_history": payload.save_history,
        "version": "history-save-v2",
    }
