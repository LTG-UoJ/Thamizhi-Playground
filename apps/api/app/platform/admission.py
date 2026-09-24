import asyncio
from collections import defaultdict
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from app.core.errors import DomainError


class AdmissionController:
    def __init__(self, limits: dict[str, int]) -> None:
        self._limits = limits
        self._active: defaultdict[str, int] = defaultdict(int)
        self._lock = asyncio.Lock()

    @asynccontextmanager
    async def admit(self, capability: str) -> AsyncIterator[None]:
        async with self._lock:
            limit = self._limits[capability]
            if self._active[capability] >= limit:
                raise DomainError(
                    "QUEUE_FULL",
                    f"The {capability.upper()} queue is at its configured limit.",
                    429,
                    retryable=True,
                    headers={"Retry-After": "1"},
                )
            self._active[capability] += 1
        try:
            yield
        finally:
            async with self._lock:
                self._active[capability] -= 1

    async def snapshot(self) -> dict[str, dict[str, int]]:
        async with self._lock:
            return {
                name: {"active": self._active[name], "limit": limit}
                for name, limit in self._limits.items()
            }
