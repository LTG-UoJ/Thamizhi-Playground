import asyncio
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core import accounts
from app.core.errors import DomainError
from app.core.security import Actor, admin_actor

router = APIRouter()


class LoginBody(BaseModel):
    user_id: str
    password: str


class CreateUserBody(BaseModel):
    user_id: str
    password: str
    role: Literal["user", "admin"] = "user"


class UpdateUserBody(BaseModel):
    role: Literal["user", "admin"] | None = None
    disabled: bool | None = None
    password: str | None = None


async def _run(fn, *args, **kwargs):
    try:
        return await asyncio.to_thread(fn, *args, **kwargs)
    except LookupError as exc:
        raise DomainError("NOT_FOUND", str(exc), 404) from exc
    except ValueError as exc:
        raise DomainError("INVALID_REQUEST", str(exc), 409) from exc


@router.post("/auth/login")
async def login(body: LoginBody) -> dict[str, object]:
    result = await asyncio.to_thread(accounts.login, body.user_id, body.password)
    if result is None:
        raise DomainError("INVALID_CREDENTIALS", "Incorrect user id or password.", 401)
    token, user = result
    return {"token": token, "user_id": user["user_id"], "role": user["role"],
            "expires_in": accounts.SESSION_HOURS * 3600}


@router.get("/admin/users")
async def list_users(_: Annotated[Actor, Depends(admin_actor)]) -> dict[str, object]:
    return {"users": await _run(accounts.list_users)}


@router.post("/admin/users", status_code=201)
async def create_user(body: CreateUserBody,
                      _: Annotated[Actor, Depends(admin_actor)]) -> dict[str, object]:
    return await _run(accounts.create_user, body.user_id, body.password, body.role)


@router.patch("/admin/users/{user_id}")
async def update_user(user_id: str, body: UpdateUserBody,
                      actor: Annotated[Actor, Depends(admin_actor)]) -> dict[str, object]:
    if user_id == actor.user_id and (body.disabled or body.role == "user"):
        raise DomainError("INVALID_REQUEST", "You cannot demote or disable yourself.", 409)
    return await _run(accounts.update_user, user_id, body.role, body.disabled, body.password)


@router.delete("/admin/users/{user_id}", status_code=204)
async def delete_user(user_id: str, actor: Annotated[Actor, Depends(admin_actor)]) -> None:
    if user_id == actor.user_id:
        raise DomainError("INVALID_REQUEST", "You cannot delete yourself.", 409)
    await _run(accounts.delete_user, user_id)
