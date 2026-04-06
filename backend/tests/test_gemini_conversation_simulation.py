from pathlib import Path
import unicodedata

import pytest

from app.core.settings import get_settings
from app.integrations.gemini_conversation_testkit import GeminiConversationTestkit


def test_gemini_creates_axa_b5341_conversation_artifacts() -> None:
    settings = get_settings()
    if not settings.ai_studio_api_key:
        pytest.skip("API_KEY_AI_STUDIO is not configured.")

    output_root = Path(__file__).resolve().parents[2] / "data" / "dev-runtime"
    testkit = GeminiConversationTestkit(settings)
    artifacts = testkit.generate_axa_claim_simulation(output_root)

    transcript = _normalize_text(artifacts.transcript_path.read_text(encoding="utf-8"))

    assert artifacts.output_dir.exists()
    assert artifacts.prompts_path.exists()
    assert artifacts.metadata_path.exists()
    assert artifacts.transcript_path.exists()
    assert artifacts.audio_path.exists()
    assert artifacts.audio_path.stat().st_size > 1024
    assert "b5341" in transcript
    assert "nif" in transcript
    assert "laura martin perez" in transcript
    assert "indemniz" in transcript
    assert "dias laborables" in transcript
    assert " 2 dias " in f" {transcript} " or " dos dias " in f" {transcript} "
    assert "gracias" in transcript
    assert any(
        farewell in transcript
        for farewell in ["hasta luego", "adios", "que tenga buen dia", "que tenga un buen dia", "un saludo"]
    )


def _normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(char for char in normalized if not unicodedata.combining(char)).lower()
