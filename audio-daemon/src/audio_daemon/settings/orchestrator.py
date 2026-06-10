"""ConfigReloadOrchestrator — apply a settings change to the live components with
the *minimum* disruption per changed field (hot-reload > swap > stream restart)."""
from __future__ import annotations

from typing import Callable, List, Optional, Set

from ..clap import clap_config_from_settings
from ..wakeword import load_model
from .edit_session import diff_settings
from .schema import Settings


def _coerce_device(mic_id: Optional[str]):
    if mic_id is None:
        return None
    return int(mic_id) if str(mic_id).isdigit() else mic_id


class ConfigReloadOrchestrator:
    def __init__(self, clap, wake, broadcaster, service=None,
                 on_broadcast: Optional[Callable[[List[str]], None]] = None):
        self._clap = clap
        self._wake = wake
        self._audio = broadcaster
        self._service = service
        self._on_broadcast = on_broadcast

    def apply_settings(self, old: Settings, new: Settings) -> Set[str]:
        changed = set(diff_settings(old, new))
        if not changed:
            return changed

        # Global enable/disable short-circuits everything else.
        if "global_enabled" in changed:
            if new.global_enabled:
                self._audio.start()
            else:
                self._audio.stop()
            self._notify(changed)
            return changed

        if any(k.startswith("clap.") for k in changed):
            self._clap.update_config(clap_config_from_settings(new.clap))  # next frame, no restart

        if "wake_word.enabled" in changed:
            self._wake.set_enabled(new.wake_word.enabled)

        if "wake_word.confidence_threshold" in changed:
            self._wake.threshold = new.wake_word.confidence_threshold

        if "wake_word.model_path" in changed and new.wake_word.model_path:
            self._wake.hot_swap_model(load_model(new.wake_word.model_path))  # < 5ms

        if "microphone_id" in changed:
            self._audio.select_device(_coerce_device(new.microphone_id))  # stream restart

        if "autostart" in changed and self._service is not None:
            self._service.set_autostart(new.autostart)

        self._notify(changed)
        return changed

    def apply_initial(self, settings: Settings, start_capture: bool = False) -> None:
        """Configure components from loaded settings at startup. Does NOT open the
        mic unless start_capture=True (avoids surprise mic access / test side effects)."""
        self._clap.update_config(clap_config_from_settings(settings.clap))
        self._wake.set_enabled(settings.wake_word.enabled)
        self._wake.threshold = settings.wake_word.confidence_threshold
        if settings.wake_word.model_path:
            self._wake.hot_swap_model(load_model(settings.wake_word.model_path))
        if settings.microphone_id is not None:
            self._audio.select_device(_coerce_device(settings.microphone_id))
        if start_capture and settings.global_enabled:
            self._audio.start()

    def _notify(self, changed: Set[str]) -> None:
        if self._on_broadcast and changed:
            self._on_broadcast(list(changed))
