"""ClapDetector: config hot-reload takes effect next frame, no restart."""
from __future__ import annotations

import numpy as np

from audio_daemon.clap import ClapConfig, ClapDetector


def _frame(amp: float, n: int = 512) -> np.ndarray:
    return np.full(n, amp, dtype=np.float32)


# amp 0.01 → ~-40 dBFS (ambient), amp 0.5 → ~-6 dBFS (a clap peak).
_AMBIENT = 0.01
_CLAP = 0.5


def test_config_hot_reload_takes_effect_next_frame():
    fired = []
    det = ClapDetector(
        config=ClapConfig(require_double=False, threshold_dbfs=-20.0, sensitivity=1.0, refractory_ms=0.0),
        on_trigger=lambda e: fired.append(e),
    )
    det.process_frame(_frame(_AMBIENT), now_ms=0)      # prime ambient (-40 dBFS < -20 → no clap)
    det.process_frame(_frame(_AMBIENT), now_ms=5)
    ev = det.process_frame(_frame(_CLAP), now_ms=10)   # loud onset → clap
    assert ev is not None and ev["type"] == "CLAP"
    assert len(fired) == 1

    # Hot-reload to a strict config (peak must exceed 0 dBFS) — no restart.
    det.update_config(ClapConfig(require_double=False, threshold_dbfs=0.0, sensitivity=1.0, refractory_ms=0.0))
    det.process_frame(_frame(_AMBIENT), now_ms=20)
    ev2 = det.process_frame(_frame(_CLAP), now_ms=30)  # ~-6 dBFS < 0 → no clap
    assert ev2 is None
    assert len(fired) == 1  # new config in effect immediately


def test_double_clap_requires_two_within_window():
    fired = []
    det = ClapDetector(
        config=ClapConfig(require_double=True, threshold_dbfs=-20.0, sensitivity=1.0,
                          double_window_ms=500.0, refractory_ms=0.0),
        on_trigger=lambda e: fired.append(e),
    )
    det.process_frame(_frame(_AMBIENT), now_ms=0)
    assert det.process_frame(_frame(_CLAP), now_ms=10) is None    # 1st clap arms the window
    det.process_frame(_frame(_AMBIENT), now_ms=20)
    ev = det.process_frame(_frame(_CLAP), now_ms=200)             # 2nd within window → fire
    assert ev is not None and ev["pattern"] == "double"
