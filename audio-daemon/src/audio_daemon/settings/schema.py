"""Versioned, validated settings schema (pydantic v2 — already a FastAPI dep)."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, model_validator

CURRENT_SCHEMA_VERSION = 2


class WakeWordSettings(BaseModel):
    enabled: bool = False
    phrase: str = "Hey Sigma"
    model_path: Optional[str] = None
    confidence_threshold: float = Field(default=0.90, ge=0.0, le=1.0)
    speaker_verify: bool = False
    enrolled_samples_count: int = 0
    last_trained_at: Optional[int] = None  # epoch ms

    @model_validator(mode="after")
    def _model_required_when_enabled(self) -> "WakeWordSettings":
        # CRITICAL invariant: a wake word can't be enabled without a trained model.
        if self.enabled and not self.model_path:
            raise ValueError("wake_word.model_path is required when wake_word.enabled is True")
        return self


class ClapSettings(BaseModel):
    enabled: bool = True
    double_clap_required: bool = True
    sensitivity: int = Field(default=3, ge=1, le=5)


class Settings(BaseModel):
    schema_version: int = CURRENT_SCHEMA_VERSION
    global_enabled: bool = True
    microphone_id: Optional[str] = None
    sensitivity: int = Field(default=3, ge=1, le=5)
    wake_word: WakeWordSettings = Field(default_factory=WakeWordSettings)
    clap: ClapSettings = Field(default_factory=ClapSettings)
    autostart: bool = True
    show_notifications: bool = True

    @classmethod
    def default(cls) -> "Settings":
        return cls()
