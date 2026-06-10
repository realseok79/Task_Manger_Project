"""AudioEngine — device enumeration + a thin facade over AudioCaptureBroadcaster.

Streaming, VU level, and mic permission are owned by the broadcaster (so detection
and enrollment can share the one mic stream). AudioEngine keeps the same public API
the server + existing tests rely on, and exposes the broadcaster for subscribers.

Degrades gracefully when sounddevice/PortAudio is unavailable (headless CI).
"""
from __future__ import annotations

from typing import Dict, List, Optional

from .capture import AudioCaptureBroadcaster

try:
    import sounddevice as sd

    _AUDIO_AVAILABLE = True
except Exception:  # noqa: BLE001 — PortAudio missing / headless CI → degrade
    sd = None
    _AUDIO_AVAILABLE = False


class AudioEngine:
    def __init__(self, broadcaster: Optional[AudioCaptureBroadcaster] = None) -> None:
        self._bc = broadcaster or AudioCaptureBroadcaster()

    @property
    def broadcaster(self) -> AudioCaptureBroadcaster:
        return self._bc

    @property
    def available(self) -> bool:
        return self._bc.available

    @property
    def running(self) -> bool:
        return self._bc.running

    def list_devices(self) -> List[Dict]:
        if not _AUDIO_AVAILABLE:
            return [{"id": 0, "name": "내장 마이크 (mock)", "host_api": "mock", "is_default": True}]
        devices = sd.query_devices()
        hostapis = sd.query_hostapis()
        try:
            default_in = sd.default.device[0]
        except Exception:  # noqa: BLE001
            default_in = -1
        out: List[Dict] = []
        for idx, dev in enumerate(devices):
            if dev.get("max_input_channels", 0) <= 0:
                continue  # input devices only
            host = ""
            if dev.get("hostapi") is not None and dev["hostapi"] < len(hostapis):
                host = hostapis[dev["hostapi"]].get("name", "")
            out.append({
                "id": idx,
                "name": dev.get("name", f"device {idx}"),
                "host_api": host,
                "is_default": idx == default_in,
            })
        if not out:
            out = [{"id": 0, "name": "입력 장치 없음", "host_api": "", "is_default": True}]
        return out

    def select_device(self, device_id: int) -> None:
        self._bc.select_device(device_id)

    def start(self) -> None:
        self._bc.start()

    def stop(self) -> None:
        self._bc.stop()

    def level_db(self) -> float:
        return self._bc.level_db()

    def mic_permission(self) -> str:
        return self._bc.mic_permission()
