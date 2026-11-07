from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.dependencies import Container, get_container
from app.core.security import Actor, current_actor

router = APIRouter(
    prefix="/admin-history-consent",
    tags=["Privacy"],
)


class ConsentRequest(BaseModel):
    accepted: bool
    version: str = "admin-history-v1"


@router.post("")
async def update_consent(
    payload: ConsentRequest,
    actor: Annotated[Actor, Depends(current_actor)],
    container: Annotated[Container, Depends(get_container)],
):
    if payload.version != "admin-history-v1":
        raise HTTPException(400, "Unsupported consent version.")

    await container.records.set_admin_history_consent(
        actor.user_id, payload.accepted
    )
    return {
        "accepted": payload.accepted,
        "version": payload.version,
    }


@router.get("")
async def get_consent(
    actor: Annotated[Actor, Depends(current_actor)],
    container: Annotated[Container, Depends(get_container)],
):
    accepted = await container.records.has_admin_history_consent(
        actor.user_id
    )
    return {
        "accepted": accepted,
        "version": "admin-history-v1",
    }
