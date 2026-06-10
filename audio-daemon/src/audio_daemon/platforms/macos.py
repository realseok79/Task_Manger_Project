"""macOS backend — LaunchAgent in the user's GUI session (has mic/TCC access)."""
from __future__ import annotations

import os
import plistlib
import subprocess
from pathlib import Path

from .. import config

LABEL = config.MACOS_LABEL


def _plist_path() -> Path:
    return Path.home() / "Library" / "LaunchAgents" / f"{LABEL}.plist"


def _domain_target() -> str:
    return f"gui/{os.getuid()}"


def _service_target() -> str:
    return f"gui/{os.getuid()}/{LABEL}"


def _build_plist() -> dict:
    logd = config.log_dir()
    return {
        "Label": LABEL,
        "ProgramArguments": config.daemon_program_arguments(),
        "RunAtLoad": True,
        # Restart on crash, but not on a clean (user-initiated) exit.
        "KeepAlive": {"SuccessfulExit": False, "Crashed": True},
        "ThrottleInterval": 5,
        "ProcessType": "Interactive",  # GUI session → mic + TCC prompt possible
        "StandardOutPath": str(logd / "teamsigma-audiodaemon.log"),
        "StandardErrorPath": str(logd / "teamsigma-audiodaemon.error.log"),
        "EnvironmentVariables": {
            "PATH": "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
            "AUDIO_DAEMON_PORT": str(config.DEFAULT_PORT),
        },
    }


def _run(args: list[str]) -> bool:
    try:
        return subprocess.run(args, capture_output=True, text=True).returncode == 0
    except FileNotFoundError:
        return False


def set_autostart(enabled: bool) -> bool:
    path = _plist_path()
    if enabled:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as fh:
            plistlib.dump(_build_plist(), fh)
        _run(["launchctl", "bootout", _service_target()])  # idempotent re-register
        return _run(["launchctl", "bootstrap", _domain_target(), str(path)])
    ok = _run(["launchctl", "bootout", _service_target()])
    try:
        path.unlink()
    except FileNotFoundError:
        pass
    return ok or True


def get_autostart_status() -> bool:
    if not _plist_path().exists():
        return False
    return subprocess.run(
        ["launchctl", "print", _service_target()], capture_output=True, text=True
    ).returncode == 0


def start() -> bool:
    return _run(["launchctl", "kickstart", "-k", _service_target()])


def stop() -> bool:
    return _run(["launchctl", "kill", "SIGTERM", _service_target()])


def restart() -> bool:
    return _run(["launchctl", "kickstart", "-k", _service_target()])
