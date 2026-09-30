from typing import Literal

from pydantic import BaseModel, Field


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2_000)
    language: Literal["en", "ta-LK"] = "ta-LK"
    voice: Literal["male", "female"] = "male"

    # Your XTTS conversion options
    voice: Literal["male", "female"] = "male"

    voice_id: str = Field(default="default", max_length=80)
    speaking_rate: float = Field(default=1.0, ge=0.5, le=2.0)
    output_format: Literal["wav"] = "wav"


class JobAccepted(BaseModel):
    job_id: str
    status: str
    status_url: str
