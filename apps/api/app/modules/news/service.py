from uuid import uuid4

import httpx

from app.core.errors import DomainError
from app.platform.admission import AdmissionController
from app.platform.audit import AuditStore
from app.platform.records import RecordingPolicy, RecordStore


class NewsService:
    def __init__(
        self,
        category_url: str,
        headline_url: str,
        admission: AdmissionController,
        audit: AuditStore,
        records: RecordStore,
    ) -> None:
        self.category_url = category_url.rstrip("/")
        self.headline_url = headline_url.rstrip("/")
        self.admission = admission
        self.audit = audit
        self.records = records

    async def classify(
        self,
        text: str,
        owner_id: str,
        policy: RecordingPolicy | None = None,
    ) -> dict[str, object]:
        request_id = str(uuid4())
        endpoint = f"{self.category_url}/classify"
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                res = await client.post(endpoint, json={"text": text})
        except httpx.TimeoutException as exc:
            raise DomainError(
                "PROVIDER_TIMEOUT",
                "The news category classification service timed out.",
                504,
                True,
            ) from exc
        except httpx.RequestError as exc:
            raise DomainError(
                "PROVIDER_UNAVAILABLE",
                f"Unable to reach the news category classification service at {endpoint}.",
                502,
                True,
            ) from exc

        if res.status_code != 200:
            raise DomainError(
                "PROVIDER_FAILURE",
                f"News category classification service returned HTTP {res.status_code}.",
                502,
                True,
            )

        data = res.json()
        category = data.get("category", "")

        await self.audit.record(
            actor_id=owner_id,
            action="news.classify",
            target_type="request",
            target_id=request_id,
            outcome="completed",
        )

        interaction_id = await self.records.create_interaction(
            interaction_id=request_id,
            user_id=owner_id,
            module_id="news-category",
            query_text=text,
            answer_text=category,
            provider_id="ceynews",
            model_id="ceynews-category-classifier",
            language="ta",
            policy=policy,
            force_save=True,
        )

        return {
            "request_id": request_id,
            "category": category,
            "provider_id": "ceynews",
            "model_id": "ceynews-category-classifier",
            "interaction_id": interaction_id,
        }

    async def generate_headline(
        self,
        text: str,
        owner_id: str,
        policy: RecordingPolicy | None = None,
    ) -> dict[str, object]:
        request_id = str(uuid4())
        endpoint = f"{self.headline_url}/generate-headline"
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                res = await client.post(endpoint, json={"text": text})
        except httpx.TimeoutException as exc:
            raise DomainError(
                "PROVIDER_TIMEOUT",
                "The news headline generation service timed out.",
                504,
                True,
            ) from exc
        except httpx.RequestError as exc:
            raise DomainError(
                "PROVIDER_UNAVAILABLE",
                f"Unable to reach the news headline generation service at {endpoint}.",
                502,
                True,
            ) from exc

        if res.status_code != 200:
            raise DomainError(
                "PROVIDER_FAILURE",
                f"News headline generation service returned HTTP {res.status_code}.",
                502,
                True,
            )

        data = res.json()
        headline = data.get("headline", "")

        await self.audit.record(
            actor_id=owner_id,
            action="news.headline",
            target_type="request",
            target_id=request_id,
            outcome="completed",
        )

        interaction_id = await self.records.create_interaction(
            interaction_id=request_id,
            user_id=owner_id,
            module_id="news-headline",
            query_text=text,
            answer_text=headline,
            provider_id="ceynews",
            model_id="ceynews-headline-generator",
            language="ta",
            policy=policy,
            force_save=True,
        )

        return {
            "request_id": request_id,
            "headline": headline,
            "provider_id": "ceynews",
            "model_id": "ceynews-headline-generator",
            "interaction_id": interaction_id,
        }
