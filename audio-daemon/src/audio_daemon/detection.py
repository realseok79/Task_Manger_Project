"""Broadcaster subscribers: live detection and (live) enrollment capture."""
from __future__ import annotations

import threading
from typing import List, Optional

import numpy as np

from .clap import ClapDetector
from .wakeword import WakeWordDetector


class DetectionSubscriber:
    """Runs clap + wake-word detection on every frame. This is the ACTIVE detector
    that must keep running throughout the edit flow."""

    def __init__(self, clap: Optional[ClapDetector], wake: Optional[WakeWordDetector]):
        self._clap = clap
        self._wake = wake

    def handle(self, frame: np.ndarray) -> None:
        if self._clap is not None:
            self._clap.process_frame(frame)
        if self._wake is not None:
            self._wake.process_frame(frame)


class EnrollmentSubscriber:
    """Captures enrollment audio on a SECOND subscription to the same mic stream,
    so live detection keeps running on its own subscription, undisturbed."""

    def __init__(self):
        self._lock = threading.Lock()
        self._frames: List[np.ndarray] = []
        self._capturing = False

    def begin(self) -> None:
        with self._lock:
            self._frames = []
            self._capturing = True

    def end(self) -> np.ndarray:
        with self._lock:
            self._capturing = False
            frames = self._frames
            self._frames = []
        return np.concatenate(frames) if frames else np.empty(0)

    def handle(self, frame: np.ndarray) -> None:
        if not self._capturing:
            return
        with self._lock:
            if self._capturing:
                self._frames.append(frame)
