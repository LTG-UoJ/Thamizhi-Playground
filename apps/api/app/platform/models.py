from typing import Literal

from pydantic import BaseModel, Field


class ModuleDescriptorRequest(BaseModel):
    module_id: str = Field(pattern=r"^[a-z][a-z0-9_-]{1,63}$")
    descriptor_version: str = Field(default="1.0", max_length=20)
    capability: str = Field(min_length=1, max_length=64)
    route_slug: str = Field(pattern=r"^[a-z][a-z0-9-]{1,63}$")
    navigation_group: Literal["workspace", "ai_modules", "administration"] = "ai_modules"
    title_key: str = Field(min_length=3, max_length=160)
    description_key: str = Field(min_length=3, max_length=160)
    icon_key: str = Field(min_length=1, max_length=64)
    sort_order: int = Field(default=100, ge=0, le=10_000)
    renderer_kind: Literal["standard_form", "compiled_custom"] = "standard_form"
    provider_capability: str = Field(min_length=1, max_length=64)
    input_schema: dict[str, object] | None = None
    output_schema: dict[str, object] | None = None
    enabled: bool = False


class ExperienceFeedbackRequest(BaseModel):
    rating: int | None = Field(default=None, ge=1, le=5)
    task_outcome: Literal["yes", "partly", "no"] | None = None
    module_ids: list[Literal["chat", "tts", "asr", "ocr"]] = Field(
        default_factory=list, max_length=4
    )
    comment: str | None = Field(default=None, max_length=2_000)
    follow_up_allowed: bool = False
    locale: Literal["en", "ta-LK"] = "en"
    session_id_hash: str | None = Field(default=None, max_length=128)
    client_version: str | None = Field(default=None, max_length=64)


class InteractionFeedbackRequest(BaseModel):
    rating: Literal["helpful", "not_helpful"]
    comment: str | None = Field(default=None, max_length=1_000)
