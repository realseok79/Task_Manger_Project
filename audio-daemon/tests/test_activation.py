"""ActivationCoordinator — the double-clap → "Hey Sig" combo gesture.

Uses an injected clock so window timing is deterministic (no sleeps).
"""
from __future__ import annotations

from audio_daemon.activation import ActivationCoordinator


class _Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


def test_combo_clap_then_wake_within_window_fires_once():
    clock = _Clock()
    fired = []
    coord = ActivationCoordinator(on_activate=fired.append, window_s=4.0, time_fn=clock)

    coord.on_clap()           # arms until t=4.0
    clock.t = 2.0
    coord.on_wake({"wake_phrase": "Hey Sig"})

    assert len(fired) == 1
    ev = fired[0]
    assert ev["type"] == "VOICE_ACTIVATION"
    assert ev["action"] == "ASK_TASKS"
    assert ev["via"] == "clap+wake"
    assert ev["wake_phrase"] == "Hey Sig"


def test_wake_alone_does_not_fire_in_combo_mode():
    coord = ActivationCoordinator(on_activate=lambda e: (_ for _ in ()).throw(AssertionError("should not fire")),
                                  window_s=4.0, time_fn=_Clock())
    coord.on_wake({"wake_phrase": "Hey Sig"})  # no preceding clap → no activation


def test_wake_after_window_expiry_does_not_fire():
    clock = _Clock()
    fired = []
    coord = ActivationCoordinator(on_activate=fired.append, window_s=4.0, time_fn=clock)

    coord.on_clap()           # arms until t=4.0
    clock.t = 5.0             # window expired
    coord.on_wake({"wake_phrase": "Hey Sig"})
    assert fired == []


def test_window_consumed_after_one_activation():
    clock = _Clock()
    fired = []
    coord = ActivationCoordinator(on_activate=fired.append, window_s=4.0, time_fn=clock)

    coord.on_clap()
    clock.t = 1.0
    coord.on_wake()           # fires
    clock.t = 2.0
    coord.on_wake()           # window already consumed → no second fire
    assert len(fired) == 1


def test_non_combo_mode_wake_alone_fires():
    fired = []
    coord = ActivationCoordinator(on_activate=fired.append, require_combo=False, time_fn=_Clock())
    coord.on_wake({"wake_phrase": "Hey Sig"})
    assert len(fired) == 1 and fired[0]["via"] == "wake"


def test_clap_only_fires_on_clap_without_wake():
    """clap_only=True: a double-clap fires immediately — no wake-word needed."""
    fired = []
    coord = ActivationCoordinator(
        on_activate=fired.append, clap_only=True, time_fn=_Clock()
    )
    coord.on_clap()
    assert len(fired) == 1
    assert fired[0]["via"] == "clap"
    assert fired[0]["type"] == "VOICE_ACTIVATION"
    assert fired[0]["action"] == "ASK_TASKS"


def test_clap_only_ignores_wake():
    """clap_only=True: wake-word events are silently ignored."""
    fired = []
    coord = ActivationCoordinator(
        on_activate=fired.append, clap_only=True, time_fn=_Clock()
    )
    coord.on_wake({"wake_phrase": "Hey Sig"})
    assert fired == []

