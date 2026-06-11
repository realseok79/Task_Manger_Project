"""ActivationCoordinator — the "double-clap THEN 'Hey Sig'" activation gesture.

A double-clap *arms* a short window; a wake-word hit within that window fires a
single VOICE_ACTIVATION (action=ASK_TASKS) → IPC resurrection → the app asks the
user for today's tasks. With require_combo=False, a wake-word alone activates.
With clap_only=True, a double-clap alone activates (no wake-word needed).
"""
from __future__ import annotations

import threading
import time
from typing import Callable, Optional


class ActivationCoordinator:
    def __init__(
        self,
        on_activate: Callable[[dict], None],
        window_s: float = 4.0,
        require_combo: bool = True,
        clap_only: bool = False,
        time_fn: Callable[[], float] = time.monotonic,
    ):
        self._on_activate = on_activate
        self._window = window_s
        self._require_combo = require_combo
        self._clap_only = clap_only
        self._now = time_fn
        self._armed_until = float("-inf")  # never armed until a clap
        self._lock = threading.Lock()

    def on_clap(self, event: Optional[dict] = None) -> None:
        """Called on a (double-)clap detection — arms the activation window,
        or fires immediately if clap_only mode is enabled."""
        if self._clap_only:
            self._fire(event or {}, via="clap")
            return
        with self._lock:
            self._armed_until = self._now() + self._window

    def on_wake(self, event: Optional[dict] = None) -> None:
        """Called on a wake-word detection — activates only if recently armed."""
        event = event or {}
        if self._clap_only:
            return  # wake is ignored in clap-only mode
        if not self._require_combo:
            self._fire(event, via="wake")
            return
        with self._lock:
            armed = self._now() <= self._armed_until
            if armed:
                self._armed_until = float("-inf")  # consume the window (one activation per clap)
        if armed:
            self._fire(event, via="clap+wake")

    def is_armed(self) -> bool:
        with self._lock:
            return self._now() <= self._armed_until

    def _fire(self, event: dict, via: str) -> None:
        self._on_activate({
            "type": "VOICE_ACTIVATION",
            "via": via,
            "wake_phrase": event.get("wake_phrase"),
            "confidence": event.get("confidence", 1.0),
            "action": "ASK_TASKS",
        })

