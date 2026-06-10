"""AudioCaptureBroadcaster — open the mic exactly once, fan frames out to subscribers.

The audio callback only appends a frame copy to each subscriber's bounded ring
buffer (atomic, non-blocking — drops oldest if a slow consumer falls behind) and
returns. Each subscriber drains its ring on its own worker thread, so one slow or
newly added/removed subscriber never stalls the audio thread or the others. The
subscriber set is copy-on-write, so the hot path reads it without a lock.
"""
from __future__ import annotations

import math
import threading
import uuid
from collections import deque
from typing import List, Optional, Protocol

import numpy as np

try:
    import sounddevice as sd

    _AUDIO_AVAILABLE = True
except Exception:  # noqa: BLE001 — PortAudio missing / headless CI → degrade
    sd = None
    _AUDIO_AVAILABLE = False

_SILENCE_DB = -120.0


class AudioSubscriber(Protocol):
    def handle(self, frame: np.ndarray) -> None: ...


class SubscriberToken:
    __slots__ = ("id",)

    def __init__(self):
        self.id = uuid.uuid4().hex


class _Runner:
    """Owns one subscriber's ring buffer + drain thread."""

    def __init__(self, subscriber: AudioSubscriber, ring_size: int = 64):
        self.token = SubscriberToken()
        self._sub = subscriber
        self._ring: deque = deque(maxlen=ring_size)  # CPython: append/popleft are atomic
        self._wake = threading.Event()
        self._stop = False
        self._thread = threading.Thread(target=self._loop, name="audio-sub", daemon=True)

    def start(self) -> None:
        self._thread.start()

    def push(self, frame: np.ndarray) -> None:
        self._ring.append(frame.copy())  # non-blocking; oldest dropped when full
        self._wake.set()

    def _loop(self) -> None:
        while not self._stop:
            self._wake.wait(0.1)
            self._wake.clear()
            while self._ring:
                try:
                    frame = self._ring.popleft()
                except IndexError:
                    break
                try:
                    self._sub.handle(frame)
                except Exception:  # noqa: BLE001 — a faulty subscriber must not kill the engine
                    pass

    def stop(self) -> None:
        self._stop = True
        self._wake.set()
        self._thread.join(timeout=1.0)


class AudioCaptureBroadcaster:
    def __init__(self, sample_rate: int = 16000, frame_size: int = 512):
        self.sample_rate = sample_rate
        self.frame_size = frame_size
        self._runners: tuple = ()          # copy-on-write; hot path reads this atomically
        self._lock = threading.Lock()      # guards mutation of _runners only
        self._stream = None
        self._selected_device: Optional[int] = None
        self._level_db = _SILENCE_DB
        self._mic_permission = "unknown"

    @property
    def available(self) -> bool:
        return _AUDIO_AVAILABLE

    @property
    def running(self) -> bool:
        return self._stream is not None

    def level_db(self) -> float:
        return self._level_db

    def mic_permission(self) -> str:
        return self._mic_permission

    # ---- subscriptions (thread-safe, non-blocking) ----
    def subscribe(self, subscriber: AudioSubscriber) -> SubscriberToken:
        runner = _Runner(subscriber)
        runner.start()
        with self._lock:
            self._runners = self._runners + (runner,)
        return runner.token

    def unsubscribe(self, token: SubscriberToken) -> None:
        with self._lock:
            removed = [r for r in self._runners if r.token is token or r.token.id == token.id]
            self._runners = tuple(r for r in self._runners if r not in removed)
        for runner in removed:
            runner.stop()  # detection + other subscribers continue uninterrupted

    def subscriber_count(self) -> int:
        return len(self._runners)

    # ---- frame fan-out (hot path; no lock) ----
    def feed_frame(self, frame: np.ndarray) -> None:
        """Deliver one frame to every subscriber. Used by the mic callback and by tests."""
        rms = float(np.sqrt(np.mean(np.square(frame, dtype=np.float64)))) if frame.size else 0.0
        self._level_db = 20.0 * math.log10(rms) if rms > 1e-7 else _SILENCE_DB
        for runner in self._runners:  # atomic read of the copy-on-write tuple
            runner.push(frame)

    # ---- mic stream lifecycle ----
    def select_device(self, device_id: int) -> None:
        self._selected_device = device_id
        if self._stream is not None:
            self.stop()
            self.start()

    def start(self) -> None:
        if not _AUDIO_AVAILABLE or self._stream is not None:
            return

        def callback(indata, frames, time_info, status):  # noqa: ANN001
            mono = indata[:, 0] if indata.ndim > 1 else indata
            self.feed_frame(np.ascontiguousarray(mono))

        try:
            self._stream = sd.InputStream(
                device=self._selected_device,
                channels=1,
                samplerate=self.sample_rate,
                blocksize=self.frame_size,
                callback=callback,
            )
            self._stream.start()
            self._mic_permission = "granted"
        except Exception as exc:  # noqa: BLE001
            self._stream = None
            msg = str(exc).lower()
            self._mic_permission = "denied" if ("permission" in msg or "access" in msg) else "error"

    def stop(self) -> None:
        if self._stream is not None:
            try:
                self._stream.stop()
                self._stream.close()
            except Exception:  # noqa: BLE001
                pass
            self._stream = None
        self._level_db = _SILENCE_DB
