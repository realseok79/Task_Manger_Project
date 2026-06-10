"""Cross-platform service facade — the API from the spec.

Dispatches start/stop/restart/autostart to the OS-specific backend in
``platforms/``. Liveness uses the pidfile first, then an HTTP probe so it works
regardless of how the daemon was started.
"""
from __future__ import annotations

import os
import sys
import urllib.request
from typing import Optional

from . import config, pidfile


def _select_backend():
    if sys.platform == "darwin":
        from .platforms import macos

        return macos
    if os.name == "nt":
        from .platforms import windows

        return windows
    from .platforms import linux

    return linux


class ServiceManager:
    def __init__(self, backend=None) -> None:
        self._backend = backend or _select_backend()

    def is_daemon_running(self) -> bool:
        pid = self.get_daemon_pid()
        if pid is not None:
            return True
        try:
            with urllib.request.urlopen(config.base_url() + "/control/status", timeout=0.7) as resp:
                return resp.status == 200
        except Exception:  # noqa: BLE001
            return False

    def get_daemon_pid(self) -> Optional[int]:
        pid = pidfile.read_pid()
        return pid if (pid and pidfile.pid_alive(pid)) else None

    def start_daemon(self) -> bool:
        return self._backend.start()

    def stop_daemon(self) -> bool:
        return self._backend.stop()

    def restart_daemon(self) -> bool:
        return self._backend.restart()

    def set_autostart(self, enabled: bool) -> bool:
        return self._backend.set_autostart(enabled)

    def get_autostart_status(self) -> bool:
        return self._backend.get_autostart_status()
