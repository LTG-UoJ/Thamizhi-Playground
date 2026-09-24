from pydantic import BaseModel, Field


class CompletionRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4_000)
    model: str | None = None
    temperature: float = Field(default=0.8, ge=0, le=2)
    top_p: float = Field(default=0.95, ge=0, le=1)
    max_tokens: int = Field(default=256, ge=1, le=2_048)


class CompletionResponse(BaseModel):
    request_id: str
    text: str
    provider_id: str
    model_id: str
    interaction_id: str | None = None
