"""Atomic model container + WakeWordModel interface.

ModelSlot is the lock-protected holder the detection thread reads every frame and
the edit flow swaps on commit. WakeWordModel is the pluggable scorer — a simple
energy-envelope template impl ships here; a neural model can drop in behind the
same interface later.
"""
from __future__ import annotations

import threading
from abc import ABC, abstractmethod
from collections import deque
from typing import Optional

import numpy as np


class WakeWordModel(ABC):
    @abstractmethod
    def infer(self, frame: np.ndarray) -> float:
        """Return a 0..1 confidence that the wake phrase is occurring."""

    def release(self) -> None:
        """Free any held resources (memory/GPU). Default: nothing."""


class NullWakeWordModel(WakeWordModel):
    """No wake word enrolled yet — always scores 0."""

    def infer(self, frame: np.ndarray) -> float:
        return 0.0


class TemplateWakeWordModel(WakeWordModel):
    """Lightweight, real (if simple) detector: correlate the live short-time energy
    envelope against an enrolled template. Numpy-only, no ML deps."""

    def __init__(self, template: np.ndarray, phrase: str):
        self._template = np.asarray(template, dtype=np.float64)
        self._tnorm = float(np.linalg.norm(self._template))
        self.phrase = phrase
        self._buf: deque = deque(maxlen=int(self._template.shape[0]))

    def infer(self, frame: np.ndarray) -> float:
        if self._template is None:
            return 0.0
        rms = float(np.sqrt(np.mean(np.square(frame, dtype=np.float64)))) if frame.size else 0.0
        self._buf.append(rms)
        if len(self._buf) < self._template.shape[0] or self._tnorm < 1e-9:
            return 0.0
        v = np.asarray(self._buf, dtype=np.float64)
        vnorm = float(np.linalg.norm(v))
        if vnorm < 1e-9:
            return 0.0
        return float(np.dot(v, self._template) / (vnorm * self._tnorm))  # cosine similarity

    def release(self) -> None:
        self._template = None
        self._tnorm = 0.0
        self._buf.clear()


class ModelSlot:
    """Thread-safe single-model container with an atomic swap."""

    def __init__(self, model: Optional[WakeWordModel] = None):
        self._model = model
        self._lock = threading.RLock()

    def get(self) -> Optional[WakeWordModel]:
        with self._lock:
            return self._model

    def atomic_swap(self, new_model: Optional[WakeWordModel]) -> Optional[WakeWordModel]:
        """Install new_model, return the old one for the caller to release()."""
        with self._lock:
            old_model = self._model
            self._model = new_model
        return old_model
