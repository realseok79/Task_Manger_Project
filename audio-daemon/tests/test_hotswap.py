"""Hot-swap: detector release, EditSession cancel/save semantics, no model leak."""
from __future__ import annotations

import gc
import time
import weakref

import numpy as np

from audio_daemon.capture import AudioCaptureBroadcaster
from audio_daemon.edit_session import EditSession, EditState
from audio_daemon.model_slot import ModelSlot, NullWakeWordModel, WakeWordModel
from audio_daemon.wakeword import WakeWordDetector, train_shadow


class _Model(WakeWordModel):
    def __init__(self):
        self.released = False

    def infer(self, frame):
        return 0.0

    def release(self):
        self.released = True


class _BigModel(WakeWordModel):
    def __init__(self):
        self.buf = np.zeros(500_000, dtype=np.float64)  # ~4MB

    def infer(self, frame):
        return 0.0

    def release(self):
        self.buf = None


def _wait(pred, timeout=3.0) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        if pred():
            return True
        time.sleep(0.005)
    return False


def _recording(rng, frames=5, frame_size=64):
    return rng.standard_normal(frame_size * frames).astype(np.float32)


def test_hot_swap_releases_old_model():
    a = _Model()
    detector = WakeWordDetector(ModelSlot(a), threshold=0.5)
    b = _Model()
    old = detector.hot_swap_model(b)
    assert old is a and a.released is True
    assert detector.current_model() is b


def test_edit_session_cancel_keeps_active_model_untouched():
    bc = AudioCaptureBroadcaster()
    active = _Model()
    detector = WakeWordDetector(ModelSlot(active))
    edit = EditSession(bc, detector, frame_size=64, required_reps=2)
    rng = np.random.default_rng(0)

    edit.open_edit("헤이 시그마")
    edit.start_recording()
    edit.cut_recording(_recording(rng))
    edit.cut_recording(_recording(rng))           # 2nd rep → training kicks off
    assert _wait(lambda: edit.state == EditState.VALIDATING)

    edit.cancel()
    assert detector.current_model() is active      # ACTIVE model never touched
    assert active.released is False
    assert edit.state == EditState.IDLE


def test_edit_session_save_atomically_swaps_model():
    bc = AudioCaptureBroadcaster()
    active = _Model()
    detector = WakeWordDetector(ModelSlot(active))
    edit = EditSession(bc, detector, frame_size=64, required_reps=2)
    rng = np.random.default_rng(1)

    edit.open_edit("헤이 시그마")
    edit.start_recording()
    edit.cut_recording(_recording(rng))
    edit.cut_recording(_recording(rng))
    assert _wait(lambda: edit.state == EditState.VALIDATING)

    assert edit.save() is True
    assert detector.current_model() is not active  # swapped to the shadow model
    assert active.released is True
    assert edit.state == EditState.IDLE


def test_100_swap_cycles_no_model_leak():
    detector = WakeWordDetector(ModelSlot(NullWakeWordModel()), threshold=0.5)
    refs = []
    for _ in range(100):
        model = _BigModel()
        refs.append(weakref.ref(model))
        detector.hot_swap_model(model)
        del model
    gc.collect()
    alive = [r for r in refs if r() is not None]
    assert len(alive) <= 1, f"{len(alive)} swapped-out models still referenced (leak)"


def test_train_shadow_builds_real_model():
    rng = np.random.default_rng(2)
    model = train_shadow([_recording(rng, frames=8) for _ in range(3)], "phrase", frame_size=64)
    score = model.infer(np.full(64, 0.2, dtype=np.float32))
    assert 0.0 <= score <= 1.0  # produces a real bounded score
