import asyncio
import json
import urllib.error
import urllib.request
from typing import Protocol
from uuid import uuid4

from app.core.config import Settings
from app.core.errors import DomainError
from app.modules.chat.models import ChatRequest
from app.platform.admission import AdmissionController
from app.platform.audit import AuditStore
from app.platform.records import RecordingPolicy, RecordStore


class ChatProvider(Protocol):
    provider_id: str
    model_id: str

    async def complete(self, request: ChatRequest) -> str: ...


class MockChatProvider:
    provider_id = "mock-chat"
    model_id = "deterministic-demo"

    async def complete(self, request: ChatRequest) -> str:
        last = next(
            message.content for message in reversed(request.messages) if message.role == "user"
        )
        if request.language == "ta-LK":
            return f"இது ஒரு சோதனைப் பதில். நீங்கள் கேட்டது: {last}"
        return f"This is a test response. You asked: {last}"


class OllamaChatProvider:
    provider_id = "ollama-local"

    def __init__(self, base_url: str, model: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.model_id = model

    async def complete(self, request: ChatRequest) -> str:
        body = json.dumps(
            {
                "model": self.model_id,
                "stream": False,
                "messages": [message.model_dump() for message in request.messages],
                "options": {"temperature": request.temperature, "num_predict": request.max_tokens},
            }
        ).encode()

        def call() -> str:
            http_request = urllib.request.Request(
                f"{self.base_url}/api/chat",
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(http_request, timeout=35) as response:
                payload = json.load(response)
            return str(payload["message"]["content"])

        try:
            return await asyncio.wait_for(asyncio.to_thread(call), timeout=40)
        except (TimeoutError, urllib.error.URLError, KeyError, ValueError) as exc:
            raise DomainError(
                "PROVIDER_FAILURE", "The local chat model failed.", 502, True
            ) from exc


def build_chat_provider(settings: Settings) -> ChatProvider:
    if settings.chat_provider == "mock":
        return MockChatProvider()
    if settings.chat_provider == "ollama":
        return OllamaChatProvider(settings.ollama_base_url, settings.ollama_model)
    raise RuntimeError(f"Unsupported chat provider: {settings.chat_provider}")


class ChatService:
    def __init__(
        self,
        provider: ChatProvider,
        admission: AdmissionController,
        audit: AuditStore,
        records: RecordStore,
    ) -> None:
        self.provider = provider
        self.admission = admission
        self.audit = audit
        self.records = records

    async def complete(
        self, request: ChatRequest, owner_id: str, policy: RecordingPolicy
    ) -> dict[str, object]:
        request_id = str(uuid4())
        async with self.admission.admit("chat"):
            text = await self.provider.complete(request)
        await self.audit.record(
            actor_id=owner_id,
            action="chat.complete",
            target_type="request",
            target_id=request_id,
            outcome="completed",
        )
        prompt = next(
            message.content for message in reversed(request.messages) if message.role == "user"
        )
        interaction_id = await self.records.create_interaction(
            interaction_id=request_id,
            user_id=owner_id,
            module_id="chat",
            query_text=prompt,
            answer_text=text,
            provider_id=self.provider.provider_id,
            model_id=self.provider.model_id,
            language=request.language,
            policy=policy,
        )
        return {
            "request_id": request_id,
            "model_id": self.provider.model_id,
            "provider_id": self.provider.provider_id,
            "message": {"role": "assistant", "content": text},
            "finish_reason": "stop",
            "interaction_id": interaction_id,
        }
