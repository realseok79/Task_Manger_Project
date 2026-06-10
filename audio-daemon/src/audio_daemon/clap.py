"""ClapDetector — real per-frame onset detection with hot-reloadable config.

Config changes take effect on the next frame (snapshot under lock); the detector
is never stopped or restarted. Per-frame transient state (previous energy, clap
timing) is owned by the single detection thread, so only config needs a lock.
"""
from __future__ import annotations

import math
import threading
import time
from dataclasses import dataclass
from typing import Callable, Optional

import numpy as np


@dataclass
class ClapConfig:
    threshold_dbfs: float = -18.0   # absolute level a clap peak must exceed
    sensitivity: float = 0.5        # 0..1 → lower required onset ratio as it rises
    require_double: bool = True
    double_window_ms: float = 600.0
    refractory_ms: float = 150.0    # ignore retriggers within this window


class ClapDetector:
    def __init__(
        self,
        config: Optional[ClapConfig] = None,
        on_trigger: Optional[Callable[[dict], None]] = None,
    ):
        self._config = config or ClapConfig()
        self._config_lock = threading.RLock()
        self._on_trigger = on_trigger
        # transient state (single detection thread)
        self._prev_rms = 1e-9
        self._last_clap_ms = -1e9
        self._first_clap_ms: Optional[float] = None

    def update_config(self, new_config: ClapConfig) -> None:
        with self._config_lock:
            self._config = new_config  # next frame snapshots this — no restart

    def process_frame(self, frame: np.ndarray, now_ms: Optional[float] = None) -> Optional[dict]:
        with self._config_lock:
            cfg = self._config  # snapshot for this frame
        now = now_ms if now_ms is not None else time.time() * 1000.0

        rms = float(np.sqrt(np.mean(np.square(frame, dtype=np.float64)))) if frame.size else 0.0
        dbfs = 20.0 * math.log10(rms) if rms > 1e-7 else -120.0
        onset_ratio = rms / (self._prev_rms + 1e-9)
        self._prev_rms = rms

        required_ratio = 3.0 - 2.0 * max(0.0, min(1.0, cfg.sensitivity))  # 1.0 (loose) .. 3.0 (strict)
        is_clap = dbfs >= cfg.threshold_dbfs and onset_ratio >= required_ratio
        if not is_clap or (now - self._last_clap_ms) < cfg.refractory_ms:
            return None
        self._last_clap_ms = now

        if not cfg.require_double:
            return self._fire(dbfs, now, single=True)

        # double-clap: first clap arms a window; a second within it fires.
        if self._first_clap_ms is None or (now - self._first_clap_ms) > cfg.double_window_ms:
            self._first_clap_ms = now
            return None
        self._first_clap_ms = None
        return self._fire(dbfs, now, single=False)

    def _fire(self, dbfs: float, now: float, single: bool) -> dict:
        event = {
            "type": "CLAP",
            "confidence": 1.0,
            "pattern": "single" if single else "double",
            "dbfs": round(dbfs, 1),
            "action": "FOCUS_OR_LAUNCH",
        }
        if self._on_trigger:
            self._on_trigger(event)
        return event
