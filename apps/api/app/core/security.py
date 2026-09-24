from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header

from app.core.config import get_settings
from app.core.errors import DomainError


@dataclass(frozen=True, slots=True)
class Actor:
    user_id: str
    consent_granted: bool
    roles: frozenset[str]


async def current_actor(
    x_user_id: str | None = Header(default=None),
    x_consent_granted: str | None = Header(default=None),
    x_roles: str | None = Header(default=None),
) -> Actor:
    settings = get_settings()
    if not settings.dev_auth_enabled:
        raise DomainError(
            "AUTHENTICATION_REQUIRED",
            "OIDC session authentication is required.",
            401,
        )
    if not x_user_id:
        raise DomainError(
            "AUTHENTICATION_REQUIRED",
            "Development requests must include X-User-ID.",
            401,
        )
    roles = frozenset(part.strip() for part in (x_roles or "user").split(",") if part.strip())
    return Actor(
        user_id=x_user_id,
        consent_granted=(x_consent_granted or "false").lower() == "true",
        roles=roles,
    )


async def consented_actor(actor: Annotated[Actor, Depends(current_actor)]) -> Actor:
    if not actor.consent_granted:
        raise DomainError("CONSENT_REQUIRED", "Active consent is required.", 403)
    return actor
