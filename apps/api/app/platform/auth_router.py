import asyncio

from fastapi import APIRouter, Header
from pydantic import BaseModel

from app.core import accounts
from app.core.config import get_settings
from app.core.errors import DomainError

router = APIRouter()


class SignupBody(BaseModel):
    user_id: str
    password: str


class GoogleBody(BaseModel):
    credential: str


def _session(token: str, user: dict) -> dict[str, object]:
    return {"token": token, "user_id": user["user_id"], "role": user["role"],
            "expires_in": accounts.SESSION_HOURS * 3600}


def _verify_google(credential: str, client_id: str) -> tuple[str, str, str]:
    from google.auth.transport import requests as grequests
    from google.oauth2 import id_token

    info = id_token.verify_oauth2_token(credential, grequests.Request(), client_id)
    if not info.get("email_verified") or not info.get("email"):
        raise ValueError("Google email is not verified.")
    if not info.get("sub"):
        raise ValueError("Google subject identifier is missing.")
    return (
        str(info["email"]),
        str(info["sub"]),
        str(info.get("name") or info["email"].split("@")[0]),
    )


@router.post("/auth/signup", status_code=201)
async def signup(body: SignupBody) -> dict[str, object]:
    if not get_settings().signup_enabled:
        raise DomainError("SIGNUP_DISABLED", "Self sign-up is turned off.", 403)
    user_id = body.user_id.strip()
    try:
        await asyncio.to_thread(accounts.create_user, user_id, body.password, "user")
    except ValueError as exc:
        raise DomainError("INVALID_REQUEST", str(exc), 409) from exc
    result = await asyncio.to_thread(accounts.login, user_id, body.password)
    if result is None:
        raise DomainError("INVALID_CREDENTIALS", "Could not sign in after sign-up.", 401)
    return _session(*result)


@router.post("/auth/google")
async def google_sign_in(body: GoogleBody) -> dict[str, object]:
    client_id = get_settings().google_client_id
    if not client_id:
        raise DomainError("GOOGLE_NOT_CONFIGURED", "Google sign-in is not configured.", 503)
    try:
        email, google_sub, display_name = await asyncio.to_thread(_verify_google, body.credential, client_id)
    except Exception as exc:  # invalid token, wrong audience, expired, network failure
        raise DomainError("INVALID_CREDENTIALS", "Google sign-in could not be verified.", 401) from exc
    result = await asyncio.to_thread(accounts.google_login, email, google_sub, display_name)
    if result is None:
        raise DomainError("INVALID_CREDENTIALS", "This account cannot sign in.", 401)
    return _session(*result)


@router.post("/auth/signout", status_code=204)
async def signout(authorization: str | None = Header(default=None)) -> None:
    if authorization and authorization.lower().startswith("bearer "):
        await asyncio.to_thread(accounts.revoke_token, authorization[7:].strip())
