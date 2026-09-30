from pydantic import BaseModel, Field


class NewsClassificationRequest(BaseModel):
    text: str = Field(min_length=1, max_length=10_000)


class NewsClassificationResponse(BaseModel):
    request_id: str
    category: str
    provider_id: str = "ceynews"
    model_id: str = "ceynews-category-classifier"
    interaction_id: str | None = None


class NewsHeadlineRequest(BaseModel):
    text: str = Field(min_length=1, max_length=10_000)


class NewsHeadlineResponse(BaseModel):
    request_id: str
    headline: str
    provider_id: str = "ceynews"
    model_id: str = "ceynews-headline-generator"
    interaction_id: str | None = None
