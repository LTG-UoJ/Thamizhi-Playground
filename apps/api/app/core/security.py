import asyncio
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header

from app.core import accounts, admins
from app.core.config import get_settings
from app.core.errors import DomainError


@dataclass(frozen=True, slots=True)
class Actor:
    user_id: str
    consent_granted: bool
    roles: frozenset[str]


async def current_actor(
    authorization: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
    x_consent_granted: str | None = Header(default=None),
) -> Actor:
    settings = get_settings()
    consent = (x_consent_granted or "false").lower() == "true"

    # Logged-in session: identity and role come from the database.
    if authorization and authorization.lower().startswith("bearer "):
        user = await asyncio.to_thread(accounts.user_for_token, authorization[7:].strip())
        if user is None:
            raise DomainError("AUTHENTICATION_REQUIRED", "Session is invalid or expired.", 401)
        roles = {"user"}
        if user["role"] == "admin":
            roles.add("platform_admin")
        return Actor(user_id=user["user_id"], consent_granted=consent, roles=frozenset(roles))

    # Development fallback (client-supplied identity). Disable for shared deployments.
    if not settings.dev_auth_enabled:
        raise DomainError(
            "AUTHENTICATION_REQUIRED",
            "Please log in.",
            401,
        )
    if not x_user_id:
        raise DomainError(
            "AUTHENTICATION_REQUIRED",
            "Development requests must include X-User-ID.",
            401,
        )
    roles = {"user"}
    if await admins.is_admin(x_user_id):
        roles.add("platform_admin")
    return Actor(user_id=x_user_id, consent_granted=consent, roles=frozenset(roles))


async def consented_actor(actor: Annotated[Actor, Depends(current_actor)]) -> Actor:
    if not actor.consent_granted:
        raise DomainError("CONSENT_REQUIRED", "Active consent is required.", 403)
    return actor


async def admin_actor(actor: Annotated[Actor, Depends(current_actor)]) -> Actor:
    if "platform_admin" not in actor.roles:
        raise DomainError("FORBIDDEN", "Platform administrator role required.", 403)
    return actor
