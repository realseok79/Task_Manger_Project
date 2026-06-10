"""EditSession — non-destructive wake-word re-enrollment state machine.

    IDLE → EDITING_SETUP → RECORDING → TRAINING → VALIDATING → COMMITTING → IDLE
                                                         └─ CANCEL (any state) ─┘

The ACTIVE WakeWordDetector keeps running on its own broadcaster subscription the
whole time. Enrollment captures on a SECOND subscription. The new model is trained
into a SHADOW slot; only COMMITTING atomically hot-swaps it in. CANCEL discards the
shadow and never touches the ACTIVE model.
"""
from __future__ import annotations

import threading
from enum import Enum
from typing import Callable, List, Optional

import numpy as np

from .detection import EnrollmentSubscriber
from .wakeword import WakeWordDetector, train_shadow


class EditState(str, Enum):
    IDLE = "IDLE"
    EDITING_SETUP = "EDITING_SETUP"
    RECORDING = "RECORDING"
    TRAINING = "TRAINING"
    VALIDATING = "VALIDATING"
    COMMITTING = "COMMITTING"


class EditSession:
    def __init__(
        self,
        broadcaster,
        detector: WakeWordDetector,
        frame_size: int,
        required_reps: int = 5,
        on_state_change: Optional[Callable[[EditState], None]] = None,
    ):
        self._bc = broadcaster
        self._detector = detector
        self._frame_size = frame_size
        self._required = required_reps
        self._on_state_change = on_state_change

        self.state = EditState.IDLE
        self._lock = threading.RLock()
        self._phrase: Optional[str] = None
        self._recordings: List[np.ndarray] = []
        self._enroll: Optional[EnrollmentSubscriber] = None
        self._enroll_token = None
        self._shadow = None
        self._progress = 0.0
        self._train_thread: Optional[threading.Thread] = None

    def _set(self, state: EditState) -> None:
        self.state = state
        if self._on_state_change:
            self._on_state_change(state)

    def open_edit(self, phrase: str) -> None:
        with self._lock:
            self._discard_shadow()
            self._recordings = []
            self._phrase = phrase
            self._set(EditState.EDITING_SETUP)

    def start_recording(self) -> None:
        with self._lock:
            if self.state not in (EditState.EDITING_SETUP, EditState.RECORDING):
                return
            if self._enroll is None:
                self._enroll = EnrollmentSubscriber()
                self._enroll_token = self._bc.subscribe(self._enroll)  # 2nd subscription; ACTIVE detector untouched
            self._enroll.begin()
            self._set(EditState.RECORDING)

    def cut_recording(self, samples: Optional[np.ndarray] = None) -> int:
        """Finalize one rep. `samples` lets callers/tests inject audio directly;
        otherwise the live enrollment buffer is used. Auto-trains at required_reps."""
        with self._lock:
            if self.state != EditState.RECORDING:
                return len(self._recordings)
            if samples is not None:
                rec = np.asarray(samples, dtype=np.float64)
            elif self._enroll is not None:
                rec = self._enroll.end()
            else:
                rec = np.empty(0)
            self._recordings.append(rec)
            if len(self._recordings) >= self._required:
                self._start_training()
            elif self._enroll is not None and samples is None:
                self._enroll.begin()  # capture the next rep
            return len(self._recordings)

    def _start_training(self) -> None:
        self._set(EditState.TRAINING)
        self._progress = 0.0
        recordings = list(self._recordings)
        phrase = self._phrase or ""
        frame_size = self._frame_size

        def run():
            shadow = train_shadow(recordings, phrase, frame_size)
            with self._lock:
                self._shadow = shadow
                self._progress = 1.0
                self._set(EditState.VALIDATING)

        self._train_thread = threading.Thread(target=run, name="wakeword-train", daemon=True)
        self._train_thread.start()

    def validate(self, frame: np.ndarray) -> float:
        shadow = self._shadow  # scored against SHADOW only — ACTIVE detector unaffected
        return float(shadow.infer(frame)) if shadow is not None else 0.0

    def save(self) -> bool:
        with self._lock:
            if self._shadow is None:
                return False
            self._set(EditState.COMMITTING)
            self._detector.hot_swap_model(self._shadow)  # atomic; detection continues with new model
            self._shadow = None
            self._unsubscribe_enrollment()
            self._recordings = []
            self._set(EditState.IDLE)
            return True

    def cancel(self) -> None:
        with self._lock:
            self._discard_shadow()              # ACTIVE model never touched
            self._unsubscribe_enrollment()
            self._recordings = []
            self._set(EditState.IDLE)

    def status(self) -> dict:
        return {
            "state": self.state.value,
            "reps": len(self._recordings),
            "required": self._required,
            "progress": round(self._progress, 3),
            "phrase": self._phrase,
        }

    # ---- internals ----
    def _discard_shadow(self) -> None:
        if self._shadow is not None:
            try:
                self._shadow.release()
            except Exception:  # noqa: BLE001
                pass
            self._shadow = None

    def _unsubscribe_enrollment(self) -> None:
        if self._enroll_token is not None:
            self._bc.unsubscribe(self._enroll_token)
        self._enroll_token = None
        self._enroll = None
