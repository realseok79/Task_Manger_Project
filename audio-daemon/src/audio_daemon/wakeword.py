"""WakeWordDetector (hot-swappable) + shadow-model training from enrollment audio."""
from __future__ import annotations

from typing import Callable, List, Optional

import numpy as np

from .model_slot import ModelSlot, NullWakeWordModel, TemplateWakeWordModel, WakeWordModel


def energy_envelope(samples: np.ndarray, frame_size: int) -> np.ndarray:
    """Short-time RMS envelope of one recording (one value per frame_size block)."""
    samples = np.asarray(samples, dtype=np.float64).reshape(-1)
    n = samples.shape[0] // frame_size
    if n == 0:
        return np.empty(0)
    blocks = samples[: n * frame_size].reshape(n, frame_size)
    return np.sqrt(np.mean(np.square(blocks), axis=1))


def train_shadow(recordings: List[np.ndarray], phrase: str, frame_size: int) -> WakeWordModel:
    """Build a SHADOW model from enrollment recordings (averaged energy envelope).

    Pure computation, safe to run in a background thread. Returns NullWakeWordModel
    if there is nothing usable to train on.
    """
    envelopes = [e for e in (energy_envelope(r, frame_size) for r in recordings) if e.size]
    if not envelopes:
        return NullWakeWordModel()
    length = min(e.shape[0] for e in envelopes)
    if length == 0:
        return NullWakeWordModel()
    template = np.stack([e[:length] for e in envelopes]).mean(axis=0)
    return TemplateWakeWordModel(template, phrase)


class WakeWordDetector:
    """Runs the ACTIVE model each frame; supports lock-free-read / atomic hot-swap."""

    def __init__(
        self,
        model_slot: Optional[ModelSlot] = None,
        threshold: float = 0.85,
        on_trigger: Optional[Callable[[dict], None]] = None,
    ):
        self._slot = model_slot or ModelSlot(NullWakeWordModel())
        self.threshold = threshold
        self._on_trigger = on_trigger

    def process_frame(self, frame: np.ndarray) -> Optional[dict]:
        model = self._slot.get()  # always the current model — fast read
        if model is None:
            return None
        score = model.infer(frame)
        if score >= self.threshold:
            event = {
                "type": "WAKE_WORD",
                "confidence": round(float(score), 4),
                "wake_phrase": getattr(model, "phrase", None),
                "action": "FOCUS_OR_LAUNCH",
            }
            if self._on_trigger:
                self._on_trigger(event)
            return event
        return None

    def hot_swap_model(self, new_model: WakeWordModel) -> Optional[WakeWordModel]:
        old = self._slot.atomic_swap(new_model)  # < 1ms, lock-guarded
        if old is not None and old is not new_model:
            try:
                old.release()  # free old model memory
            except Exception:
                pass
        return old

    def current_model(self) -> Optional[WakeWordModel]:
        return self._slot.get()
