from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MAP_", env_file=".env", extra="ignore")

    environment: str = Field(default="development", alias="MAP_ENV")
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    dev_auth_enabled: bool = True
    default_locale: str = "en"
    artifact_dir: Path = Path("artifacts")
    record_database_path: Path = Path("data/playground.sqlite3")
    tts_provider: str = "mock"
    coqui_tts_url: str = "http://thamizhi-xtts:5002"
    asr_provider: str = "external"
    asr_upload_url: str = "http://10.10.10.91:8000/upload?lang=ta"
    asr_ws_url: str = "ws://10.10.10.91:8000/ws/asr"
    chat_provider: str = "mock"
    ocr_provider: str = "mock"
    completion_provider: str = "ollama"
    completion_model: str = "slt-trilingual-1b:latest"
    completion_base_url: str = "http://10.10.10.91:11435"
    ollama_base_url: str = "http://10.10.10.91:11435"
    ollama_model: str = "qwen2.5:3b"
    tesseract_command: str = "tesseract"
    espeak_command: str = "espeak-ng"
    cors_origins: str = "http://localhost:3000"

    @property
    def allowed_origins(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
