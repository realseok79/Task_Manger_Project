"""ModelSlot: atomic swap correctness, < 1ms swap latency, concurrent get/swap."""
from __future__ import annotations

import threading
import time

import numpy as np

from audio_daemon.model_slot import ModelSlot, WakeWordModel


class _Model(WakeWordModel):
    def __init__(self, score: float = 0.0):
        self.score = score
        self.released = False

    def infer(self, frame):
        return self.score

    def release(self):
        self.released = True


def test_atomic_swap_returns_old_installs_new():
    a, b = _Model(0.1), _Model(0.9)
    slot = ModelSlot(a)
    assert slot.get() is a
    assert slot.atomic_swap(b) is a
    assert slot.get() is b


def test_swap_latency_under_1ms():
    slot = ModelSlot(_Model())
    times = []
    for _ in range(1000):
        m = _Model()
        t0 = time.perf_counter()
        slot.atomic_swap(m)
        slot.get()
        times.append(time.perf_counter() - t0)
    times.sort()
    p99 = times[int(0.99 * len(times))]
    assert p99 < 1e-3, f"p99 swap latency {p99 * 1e6:.1f}us exceeds 1ms"


def test_concurrent_get_swap_no_race():
    slot = ModelSlot(_Model())
    stop = threading.Event()
    errors = []

    def reader():
        try:
            frame = np.zeros(16, dtype=np.float32)
            while not stop.is_set():
                m = slot.get()
                if m is not None:
                    m.infer(frame)
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)

    def swapper():
        try:
            for _ in range(2000):
                slot.atomic_swap(_Model())
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)

    readers = [threading.Thread(target=reader) for _ in range(4)]
    swappers = [threading.Thread(target=swapper) for _ in range(2)]
    for t in readers + swappers:
        t.start()
    for t in swappers:
        t.join()
    stop.set()
    for t in readers:
        t.join()
    assert not errors
