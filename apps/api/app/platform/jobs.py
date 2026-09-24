import asyncio
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.core.errors import DomainError


@dataclass(slots=True)
class Job:
    job_id: str
    capability: str
    owner_id: str
    status: str = "queued"
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    result: dict[str, Any] | None = None
    error: dict[str, Any] | None = None


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = asyncio.Lock()

    async def create(self, capability: str, owner_id: str) -> Job:
        job = Job(job_id=str(uuid4()), capability=capability, owner_id=owner_id)
        async with self._lock:
            self._jobs[job.job_id] = job
        return job

    async def set_running(self, job_id: str) -> None:
        await self._update(job_id, status="running")

    async def complete(self, job_id: str, result: dict[str, Any]) -> None:
        await self._update(job_id, status="completed", result=result)

    async def fail(self, job_id: str, code: str, message: str) -> None:
        await self._update(job_id, status="failed", error={"code": code, "message": message})

    async def _update(self, job_id: str, **changes: Any) -> None:
        async with self._lock:
            job = self._jobs[job_id]
            for key, value in changes.items():
                setattr(job, key, value)
            job.updated_at = datetime.now(UTC).isoformat()

    async def get(self, job_id: str, owner_id: str) -> dict[str, Any]:
        async with self._lock:
            job = self._jobs.get(job_id)
            if not job or job.owner_id != owner_id:
                raise DomainError("NOT_FOUND", "Job not found.", 404)
            return asdict(job)
