from typing import Literal

from pydantic import BaseModel


class ASRSessionRequest(BaseModel):
    language: Literal["en", "ta-LK"] = "en"
    mode: Literal["live", "batch"] = "live"


class ASRSession(BaseModel):
    session_id: str
    status: str
    stream_url: str
    provider_id: str


class Transcript(BaseModel):
    text: str
    language: str
    provider_id: str
    confidence: float | None = None
    interaction_id: str | None = None
