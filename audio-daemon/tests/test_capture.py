"""AudioCaptureBroadcaster: fan-out, detection-continues-during-enrollment, concurrency."""
from __future__ import annotations

import threading
import time

import numpy as np

from audio_daemon.capture import AudioCaptureBroadcaster


class _Counter:
    def __init__(self):
        self.count = 0
        self._lock = threading.Lock()

    def handle(self, frame):
        with self._lock:
            self.count += 1


def _wait(pred, timeout=3.0) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        if pred():
            return True
        time.sleep(0.005)
    return False


def _feed_drained(bc, runner_counter, frame, n):
    """Feed n frames then wait until drained — keeps within ring size, so no drops."""
    target = runner_counter.count + n
    for _ in range(n):
        bc.feed_frame(frame)
    assert _wait(lambda: runner_counter.count >= target), f"{runner_counter.count} < {target}"


def test_detection_continues_during_enrollment():
    bc = AudioCaptureBroadcaster()
    detection = _Counter()
    bc.subscribe(detection)
    frame = np.full(512, 0.1, dtype=np.float32)

    _feed_drained(bc, detection, frame, 20)
    base = detection.count

    enrollment = _Counter()
    token = bc.subscribe(enrollment)          # add enrollment mid-stream
    _feed_drained(bc, enrollment, frame, 20)
    assert detection.count >= base + 20       # detection kept receiving throughout

    bc.unsubscribe(token)                      # remove enrollment
    mid = detection.count
    enr_final = enrollment.count
    _feed_drained(bc, detection, frame, 20)
    assert detection.count >= mid + 20         # detection uninterrupted after removal
    time.sleep(0.05)
    assert enrollment.count == enr_final       # removed subscriber receives nothing further


def test_no_frame_loss_when_consumer_keeps_up():
    bc = AudioCaptureBroadcaster()
    sub = _Counter()
    bc.subscribe(sub)
    frame = np.full(256, 0.2, dtype=np.float32)
    for _ in range(10):
        _feed_drained(bc, sub, frame, 40)      # 400 frames total, drained in chunks
    assert sub.count == 400                     # zero loss when the consumer keeps pace


def test_1000_concurrent_frame_deliveries_no_race():
    bc = AudioCaptureBroadcaster()
    stable = _Counter()
    bc.subscribe(stable)
    frame = np.full(256, 0.2, dtype=np.float32)
    errors = []

    def feeder():
        try:
            for _ in range(1000):
                bc.feed_frame(frame)
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)

    def churn():
        try:
            for _ in range(200):
                tok = bc.subscribe(_Counter())
                bc.unsubscribe(tok)
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=feeder) for _ in range(3)] + \
              [threading.Thread(target=churn) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors                           # no race/crash under concurrent feed + churn
    assert _wait(lambda: stable.count > 0)      # stable subscriber kept delivering
    assert stable.count <= 3000                 # bounded ring may drop under burst (by design)
