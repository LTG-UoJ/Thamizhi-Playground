import asyncio
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from uuid import uuid4


@dataclass(frozen=True, slots=True)
class AuditEvent:
    event_id: str
    occurred_at: str
    actor_id: str
    action: str
    target_type: str
    target_id: str
    outcome: str


class AuditStore:
    def __init__(self) -> None:
        self._events: list[AuditEvent] = []
        self._lock = asyncio.Lock()

    async def record(
        self,
        *,
        actor_id: str,
        action: str,
        target_type: str,
        target_id: str,
        outcome: str,
    ) -> AuditEvent:
        event = AuditEvent(
            event_id=str(uuid4()),
            occurred_at=datetime.now(UTC).isoformat(),
            actor_id=actor_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            outcome=outcome,
        )
        async with self._lock:
            self._events.append(event)
        return event

    async def list_for_actor(self, actor_id: str) -> list[dict[str, str]]:
        async with self._lock:
            return [asdict(event) for event in self._events if event.actor_id == actor_id]
