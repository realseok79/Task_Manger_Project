"""SettingsEditSession — copy-on-edit draft so the live settings are never mutated
until an explicit Save. (Distinct from the enrollment ``edit_session.EditSession``.)
"""
from __future__ import annotations

from typing import Any, List

from .schema import Settings


def diff_settings(old: Settings, new: Settings) -> List[str]:
    """Dot-notation paths of the fields that differ between two Settings."""
    changes: List[str] = []
    _diff(old.model_dump(), new.model_dump(), "", changes)
    return changes


def _diff(a: dict, b: dict, prefix: str, out: List[str]) -> None:
    for key in a.keys() | b.keys():
        va, vb = a.get(key), b.get(key)
        path = f"{prefix}{key}"
        if isinstance(va, dict) and isinstance(vb, dict):
            _diff(va, vb, path + ".", out)
        elif va != vb:
            out.append(path)


class SettingsEditSession:
    def __init__(self, current_settings: Settings):
        self._original = current_settings.model_copy(deep=True)  # untouched
        self._draft = current_settings.model_copy(deep=True)
        self._is_dirty = False

    def update_field(self, key: str, value: Any) -> None:
        keys = key.split(".")
        obj = self._draft
        for k in keys[:-1]:
            obj = getattr(obj, k)
        setattr(obj, keys[-1], value)  # draft only — original never touched
        self._is_dirty = True

    @property
    def draft(self) -> Settings:
        return self._draft

    @property
    def original(self) -> Settings:
        return self._original

    def commit(self) -> Settings:
        return self._draft  # caller validates + persists

    def discard(self) -> Settings:
        return self._original  # unchanged

    def has_changes(self) -> bool:
        return self._is_dirty

    def get_changed_fields(self) -> List[str]:
        return diff_settings(self._original, self._draft)
