"""SettingsStore — thread-safe current-settings holder backed by atomic writes."""
from __future__ import annotations

import threading
from pathlib import Path
from typing import Optional

from .atomic_writer import AtomicSettingsWriter
from .schema import Settings


class SettingsStore:
    def __init__(self, path: Path):
        self._path = Path(path)
        self._writer = AtomicSettingsWriter(self._path)
        self._lock = threading.RLock()
        self._settings = Settings.default()
        self._last_mtime: Optional[float] = None

    @property
    def path(self) -> Path:
        return self._path

    @property
    def last_mtime(self) -> Optional[float]:
        return self._last_mtime

    def load(self) -> Settings:
        with self._lock:
            self._settings = self._writer.load()
            self._refresh_mtime()
            return self._settings

    def current(self) -> Settings:
        with self._lock:
            return self._settings

    def save(self, settings: Settings) -> Settings:
        with self._lock:
            self._writer.save(settings)
            self._settings = settings
            self._refresh_mtime()
            return settings

    def _refresh_mtime(self) -> None:
        try:
            self._last_mtime = self._path.stat().st_mtime
        except OSError:
            self._last_mtime = None
