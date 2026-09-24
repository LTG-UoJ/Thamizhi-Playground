from datetime import timedelta

import pytest

from app.core.errors import DomainError
from app.platform.admission import AdmissionController
from app.platform.idempotency import IdempotencyStore


@pytest.mark.asyncio
async def test_idempotency_does_not_store_raw_key() -> None:
    store = IdempotencyStore(ttl=timedelta(hours=24))
    assert await store.reserve("user", "route", "raw-secret-key", "fingerprint") is None
    await store.complete("user", "route", "raw-secret-key", {"job_id": "job"})
    assert await store.reserve("user", "route", "raw-secret-key", "fingerprint") == {
        "job_id": "job"
    }
    assert "raw-secret-key" not in repr(store._entries)


@pytest.mark.asyncio
async def test_admission_rejects_at_limit() -> None:
    controller = AdmissionController({"chat": 1})
    async with controller.admit("chat"):
        with pytest.raises(DomainError) as captured:
            async with controller.admit("chat"):
                pass
    assert captured.value.status_code == 429
    assert captured.value.code == "QUEUE_FULL"
