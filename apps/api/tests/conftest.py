import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.dependencies import get_container
from app.main import app


@pytest.fixture(autouse=True)
def _test_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MAP_TTS_PROVIDER", "mock")
    monkeypatch.setenv("MAP_ASR_PROVIDER", "mock")
    monkeypatch.setenv("MAP_CHAT_PROVIDER", "mock")
    monkeypatch.setenv("MAP_OCR_PROVIDER", "mock")
    monkeypatch.setenv("MAP_COMPLETION_PROVIDER", "mock")
    get_settings.cache_clear()
    get_container.cache_clear()


@pytest.fixture()
def client() -> TestClient:
    get_settings.cache_clear()
    get_container.cache_clear()
    with TestClient(app) as test_client:
        yield test_client
    get_settings.cache_clear()
    get_container.cache_clear()


@pytest.fixture()
def headers() -> dict[str, str]:
    return {"X-User-ID": "test-user", "X-Consent-Granted": "true"}
