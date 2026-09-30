import httpx
import pytest
from starlette.testclient import TestClient


@pytest.mark.asyncio
async def test_news_classify_saves_to_database(
    client: TestClient, headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    async def mock_post(self: httpx.AsyncClient, url: str, **kwargs: object) -> httpx.Response:
        return httpx.Response(
            200,
            json={"category": "Sports"},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    response = client.post(
        "/api/v1/news/classify",
        headers=headers,
        json={"text": "இலங்கை கிரிக்கெட் அணி வெற்றி பெற்றது."},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["category"] == "Sports"
    assert data["interaction_id"] is not None

    # Verify it is saved in history / database
    history = client.get("/api/v1/activity/me?module_id=news-category", headers=headers)
    assert history.status_code == 200
    interactions = history.json()["interactions"]
    assert len(interactions) >= 1
    latest = interactions[0]
    assert latest["module_id"] == "news-category"
    assert latest["query_text"] == "இலங்கை கிரிக்கெட் அணி வெற்றி பெற்றது."
    assert latest["answer_text"] == "Sports"


@pytest.mark.asyncio
async def test_news_headline_saves_to_database(
    client: TestClient, headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    async def mock_post(self: httpx.AsyncClient, url: str, **kwargs: object) -> httpx.Response:
        return httpx.Response(
            200,
            json={"headline": "இலங்கை அணி அபார வெற்றி"},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    response = client.post(
        "/api/v1/news/generate-headline",
        headers=headers,
        json={"text": "முழுமையான செய்தி விவரங்கள் இங்கே உள்ளன."},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["headline"] == "இலங்கை அணி அபார வெற்றி"
    assert data["interaction_id"] is not None

    # Verify it is saved in history / database
    history = client.get("/api/v1/activity/me?module_id=news-headline", headers=headers)
    assert history.status_code == 200
    interactions = history.json()["interactions"]
    assert len(interactions) >= 1
    latest = interactions[0]
    assert latest["module_id"] == "news-headline"
    assert latest["query_text"] == "முழுமையான செய்தி விவரங்கள் இங்கே உள்ளன."
    assert latest["answer_text"] == "இலங்கை அணி அபார வெற்றி"
