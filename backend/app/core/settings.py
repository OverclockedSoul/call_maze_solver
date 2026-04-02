from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    frontend_url: str = "http://localhost:5173"
    public_base_url: str = "http://localhost:8000"
    database_url: str = "sqlite:///./data/app.db"

    telnyx_api_key: str = ""
    telnyx_public_key: str = ""
    telnyx_connection_id: str = ""
    telnyx_phone_number: str = ""
    telnyx_telephony_credential_id: str = ""
    telnyx_sip_username: str = ""
    telnyx_sip_password: str = ""
    telnyx_sip_domain: str = "sip.telnyx.com"
    telnyx_voice_en_us: str = "AWS.Polly.Joanna-Neural"
    telnyx_voice_es_es: str = "AWS.Polly.Lucia-Neural"

    ai_studio_api_key: str = Field(default="", alias="API_KEY_AI_STUDIO")
    llm_model: str = "gemini-2.5-flash"

    default_ui_language: str = "es"
    default_call_language: str = "es-ES"
    default_disclosure_policy: str = "conditional"
    default_recording_enabled: bool = True
    recording_retention_days: int = 365
    recording_mirror_dir: str = "./data/recordings"
    transcript_export_dir: str = "./data/transcripts"

    @property
    def recording_mirror_path(self) -> Path:
        return Path(self.recording_mirror_dir)

    @property
    def transcript_export_path(self) -> Path:
        return Path(self.transcript_export_dir)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.recording_mirror_path.mkdir(parents=True, exist_ok=True)
    settings.transcript_export_path.mkdir(parents=True, exist_ok=True)
    return settings
