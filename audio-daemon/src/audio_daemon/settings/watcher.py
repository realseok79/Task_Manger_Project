"""SettingsWatcher — backup sync path for *external* edits to settings.json.

The daemon owns/writes the file, so this only fires on changes it didn't make
(a hand-edit, or a future native app). Plain stdlib mtime polling — no watchdog dep.
"""
from __future__ import annotations

import threading
from typing import Callable, Optional

from .schema import Settings
from .store import SettingsStore


class SettingsWatcher:
    def __init__(
        self,
        store: SettingsStore,
        on_external_change: Callable[[Settings, Settings], None],
        interval: float = 2.0,
    ):
        self._store = store
        self._on_change = on_external_change
        self._interval = interval
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        if self._thread is None:
            self._thread = threading.Thread(target=self._loop, name="settings-watch", daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=1.0)
            self._thread = None

    def _loop(self) -> None:
        while not self._stop.wait(self._interval):
            try:
                path = self._store.path
                if not path.exists():
                    continue
                mtime = path.stat().st_mtime
                if self._store.last_mtime is not None and mtime != self._store.last_mtime:
                    old = self._store.current()
                    new = self._store.load()  # reload + refresh mtime
                    self._on_change(old, new)
            except Exception:  # noqa: BLE001 — watcher must never crash the daemon
                pass
