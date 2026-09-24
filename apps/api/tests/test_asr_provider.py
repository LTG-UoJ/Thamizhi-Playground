import httpx
import pytest

from app.core.config import Settings
from app.core.errors import DomainError
from app.modules.asr.service import (
    ExternalASRProvider,
    MockASRProvider,
    build_asr_provider,
)


@pytest.mark.asyncio
async def test_mock_asr_provider_still_works() -> None:
    provider = MockASRProvider()
    result = await provider.transcribe(b"\x00" * 32000, "en")
    assert "Test audio received" in str(result["text"])
    assert result["language"] == "en"

    ta_result = await provider.transcribe(b"\x00" * 32000, "ta-LK")
    assert "சோதனை" in str(ta_result["text"])
    assert ta_result["language"] == "ta-LK"


def test_build_asr_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MAP_ASR_UPLOAD_URL", raising=False)
    monkeypatch.delenv("MAP_ASR_WS_URL", raising=False)
    mock_settings = Settings(asr_provider="mock", _env_file=None)
    assert isinstance(build_asr_provider(mock_settings), MockASRProvider)

    ext_settings = Settings(
        asr_provider="external",
        asr_upload_url="http://test-asr:8000/upload",
        asr_ws_url="ws://test-asr:8000/ws/asr",
        _env_file=None,
    )
    provider = build_asr_provider(ext_settings)
    assert isinstance(provider, ExternalASRProvider)
    assert provider.upload_url == "http://test-asr:8000/upload"
    assert provider.ws_url == "ws://test-asr:8000/ws/asr"


@pytest.mark.asyncio
async def test_external_asr_upload_success(monkeypatch: pytest.MonkeyPatch) -> None:
    provider = ExternalASRProvider(
        upload_url="http://mock-asr:8000/upload",
        ws_url="ws://mock-asr:8000/ws/asr",
    )

    async def mock_post(self: httpx.AsyncClient, url: str, **kwargs: object) -> httpx.Response:
        assert "language=ta" in url
        return httpx.Response(
            200,
            json={
                "status": "success",
                "detected_language": "ta",
                "duration_seconds": 2.5,
                "transcription": "வணக்கம் உலகம்",
            },
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    result = await provider.transcribe(b"RIFF\x00\x00\x00\x00WAVEfmt ", "ta-LK")
    assert result["text"] == "வணக்கம் உலகம்"
    assert result["language"] == "ta"
    assert result["duration_seconds"] == 2.5


@pytest.mark.asyncio
async def test_external_asr_http_error(monkeypatch: pytest.MonkeyPatch) -> None:
    provider = ExternalASRProvider(
        upload_url="http://mock-asr:8000/upload",
        ws_url="ws://mock-asr:8000/ws/asr",
    )

    async def mock_post(self: httpx.AsyncClient, url: str, **kwargs: object) -> httpx.Response:
        return httpx.Response(
            500,
            text="Internal Server Error",
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    with pytest.raises(DomainError) as exc_info:
        await provider.transcribe(b"RIFF\x00\x00\x00\x00WAVEfmt ", "en")
    assert exc_info.value.code == "PROVIDER_FAILURE"
    assert exc_info.value.status_code == 502


@pytest.mark.asyncio
async def test_external_asr_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    provider = ExternalASRProvider(
        upload_url="http://mock-asr:8000/upload",
        ws_url="ws://mock-asr:8000/ws/asr",
    )

    async def mock_post(self: httpx.AsyncClient, url: str, **kwargs: object) -> httpx.Response:
        raise httpx.ReadTimeout("Connection timed out", request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    with pytest.raises(DomainError) as exc_info:
        await provider.transcribe(b"audio-data", "en")
    assert exc_info.value.code == "PROVIDER_TIMEOUT"
    assert exc_info.value.status_code == 504


@pytest.mark.asyncio
async def test_external_asr_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    provider = ExternalASRProvider(
        upload_url="http://mock-asr:8000/upload",
        ws_url="ws://mock-asr:8000/ws/asr",
    )

    async def mock_post(self: httpx.AsyncClient, url: str, **kwargs: object) -> httpx.Response:
        raise httpx.ConnectError("Unable to connect", request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    with pytest.raises(DomainError) as exc_info:
        await provider.transcribe(b"audio-data", "en")
    assert exc_info.value.code == "PROVIDER_UNAVAILABLE"
    assert exc_info.value.status_code == 502


@pytest.mark.asyncio
async def test_external_asr_malformed_response(monkeypatch: pytest.MonkeyPatch) -> None:
    provider = ExternalASRProvider(
        upload_url="http://mock-asr:8000/upload",
        ws_url="ws://mock-asr:8000/ws/asr",
    )

    async def mock_post(self: httpx.AsyncClient, url: str, **kwargs: object) -> httpx.Response:
        return httpx.Response(
            200,
            content=b"not json",
            headers={"Content-Type": "application/json"},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    with pytest.raises(DomainError) as exc_info:
        await provider.transcribe(b"audio-data", "en")
    assert exc_info.value.code == "PROVIDER_FAILURE"
    assert exc_info.value.status_code == 502
