from typing import Literal

from pydantic import BaseModel


class OCRBlock(BaseModel):
    text: str
    confidence: float | None = None
    polygon: list[list[float]]


class OCRResult(BaseModel):
    text: str
    language: str
    provider_id: str
    blocks: list[OCRBlock]


class OCRJobAccepted(BaseModel):
    job_id: str
    status: str
    status_url: str


OCRLanguage = Literal["en", "ta-LK"]
