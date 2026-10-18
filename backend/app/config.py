"""Environment-driven configuration. Secrets stay on the backend and are never serialised."""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"), env_file_encoding="utf-8", extra="ignore"
    )

    app_env: Literal["development", "demo", "test", "production"] = "development"

    # --- FalkorDB -----------------------------------------------------------------
    falkordb_host: str = "localhost"
    falkordb_port: int = 6379
    falkordb_password: SecretStr | None = None
    falkordb_graph: str = "contextops"
    falkordb_connect_retries: int = 30
    falkordb_connect_delay_seconds: float = 1.0

    # --- Agent / LLM --------------------------------------------------------------
    agent_mode: Literal["llm", "rules", "auto"] = "auto"
    openai_api_key: SecretStr | None = None
    openai_model: str = "gpt-4o-mini"  # verify the model name in your provider's docs
    openai_base_url: str = "https://api.openai.com/v1"
    # How the key is sent: "bearer" (Authorization: Bearer), "x-goog-api-key", or "auto"
    # (auto = x-goog-api-key for Google AQ. keys on generativelanguage.googleapis.com, otherwise bearer).
    llm_auth_style: Literal["auto", "bearer", "x-goog-api-key"] = "auto"
    # Native Gemini provider (google-genai SDK): same variable names as the common GEMINI_API_KEY / GEMINI_MODEL setup.
    gemini_api_key: SecretStr | None = None
    gemini_model: str = "gemini-3.1-flash-lite"
    # auto = gemini if only GEMINI_API_KEY is set, otherwise the OpenAI-compatible provider
    llm_provider: Literal["auto", "openai", "gemini"] = "auto"
    llm_max_steps: int = 10
    llm_timeout_seconds: float = 45.0

    # --- HTTP ---------------------------------------------------------------------
    cors_origins: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:8080,http://127.0.0.1:8080"
    )
    auto_seed: bool = True
    max_logs_chars: int = 20_000
    max_description_chars: int = 4_000

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def effective_provider(self) -> str:
        if self.llm_provider != "auto":
            return self.llm_provider
        openai_key = self.openai_api_key.get_secret_value().strip() if self.openai_api_key else ""
        gemini_key = self.gemini_api_key.get_secret_value().strip() if self.gemini_api_key else ""
        return "gemini" if (gemini_key and not openai_key) else "openai"

    @property
    def llm_key(self) -> str:
        k = self.gemini_api_key if self.effective_provider == "gemini" else self.openai_api_key
        return k.get_secret_value().strip() if k else ""

    @property
    def llm_model(self) -> str:
        return self.gemini_model if self.effective_provider == "gemini" else self.openai_model

    @property
    def llm_configured(self) -> bool:
        return bool(self.llm_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
