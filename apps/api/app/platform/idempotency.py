import asyncio
import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from app.core.errors import DomainError


@dataclass(slots=True)
class Entry:
    fingerprint: str
    expires_at: datetime
    response: dict[str, Any] | None = None


class IdempotencyStore:
    def __init__(self, ttl: timedelta = timedelta(hours=24)) -> None:
        self._ttl = ttl
        self._entries: dict[tuple[str, str, str], Entry] = {}
        self._lock = asyncio.Lock()

    @staticmethod
    def fingerprint(payload: object) -> str:
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
        return hashlib.sha256(canonical.encode()).hexdigest()

    async def reserve(
        self, user_id: str, route_id: str, key: str, fingerprint: str
    ) -> dict[str, Any] | None:
        scope = (user_id, route_id, hashlib.sha256(key.encode()).hexdigest())
        now = datetime.now(UTC)
        async with self._lock:
            existing = self._entries.get(scope)
            if existing and existing.expires_at <= now:
                del self._entries[scope]
                existing = None
            if existing:
                if existing.fingerprint != fingerprint:
                    raise DomainError(
                        "IDEMPOTENCY_CONFLICT",
                        "This idempotency key was used for a different request.",
                        409,
                    )
                if existing.response is None:
                    raise DomainError(
                        "IDEMPOTENCY_IN_PROGRESS",
                        "The original request is still processing.",
                        409,
                        retryable=True,
                        headers={"Retry-After": "1"},
                    )
                return existing.response
            self._entries[scope] = Entry(fingerprint=fingerprint, expires_at=now + self._ttl)
            return None

    async def complete(
        self,
        user_id: str,
        route_id: str,
        key: str,
        response: dict[str, Any],
    ) -> None:
        scope = (user_id, route_id, hashlib.sha256(key.encode()).hexdigest())
        async with self._lock:
            if scope in self._entries:
                self._entries[scope].response = response

    async def forget(self, user_id: str, route_id: str, key: str) -> None:
        scope = (user_id, route_id, hashlib.sha256(key.encode()).hexdigest())
        async with self._lock:
            self._entries.pop(scope, None)
