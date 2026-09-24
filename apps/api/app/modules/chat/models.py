from typing import Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1, max_length=8_000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=30)
    language: Literal["en", "ta-LK"] = "en"
    stream: bool = False
    temperature: float = Field(default=0.2, ge=0, le=1)
    max_tokens: int = Field(default=512, ge=1, le=2_048)


class ChatResponse(BaseModel):
    request_id: str
    model_id: str
    provider_id: str
    message: ChatMessage
    finish_reason: str
    interaction_id: str | None = None
