"""Shared naming, ports and per-user paths (single source of truth)."""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Naming — matches the project's com.teamsigma.* convention.
APP_VENDOR = "TeamSigma"
MACOS_LABEL = "com.teamsigma.audiodaemon"
LINUX_UNIT = "teamsigma-audiodaemon.service"
WINDOWS_TASK = "TeamSigma_AudioDaemon"

# Network — dedicated port to avoid the :8080 collision (Spring Boot + alarm-system).
DEFAULT_HOST = os.environ.get("AUDIO_DAEMON_HOST", "127.0.0.1")
DEFAULT_PORT = int(os.environ.get("AUDIO_DAEMON_PORT", "8770"))

# App + backend the daemon talks to / resurrects.
APP_URL = os.environ.get("AUDIO_DAEMON_APP_URL", "http://localhost:5173")           # browser SPA
BACKEND_URL = os.environ.get("AUDIO_DAEMON_BACKEND_URL", "http://localhost:8080")   # Spring Boot
BACKEND_HEALTH_PATH = os.environ.get("AUDIO_DAEMON_BACKEND_HEALTH_PATH", "/actuator/health")
BACKEND_HEALTH_INTERVAL = float(os.environ.get("AUDIO_DAEMON_BACKEND_HEALTH_INTERVAL", "30"))

# IPC tunables (see ipc.py / spec's reconnection & heartbeat section).
IPC_HEARTBEAT_INTERVAL = float(os.environ.get("AUDIO_DAEMON_IPC_HEARTBEAT_INTERVAL", "5"))
IPC_HEARTBEAT_TIMEOUT_MS = int(os.environ.get("AUDIO_DAEMON_IPC_HEARTBEAT_TIMEOUT_MS", "15000"))
IPC_RESURRECT_DEBOUNCE = float(os.environ.get("AUDIO_DAEMON_IPC_RESURRECT_DEBOUNCE", "5"))
IPC_TRIGGER_ACK_TIMEOUT = float(os.environ.get("AUDIO_DAEMON_IPC_TRIGGER_ACK_TIMEOUT", "3"))

# Detection engine.
AUDIO_SAMPLE_RATE = int(os.environ.get("AUDIO_DAEMON_SAMPLE_RATE", "16000"))
AUDIO_FRAME_SIZE = int(os.environ.get("AUDIO_DAEMON_FRAME_SIZE", "512"))
WAKE_THRESHOLD = float(os.environ.get("AUDIO_DAEMON_WAKE_THRESHOLD", "0.85"))
ENROLLMENT_REPS = int(os.environ.get("AUDIO_DAEMON_ENROLLMENT_REPS", "5"))


def base_url(port: int | None = None) -> str:
    return f"http://{DEFAULT_HOST}:{port or DEFAULT_PORT}"


def state_dir() -> Path:
    """Per-user writable dir for runtime state (pidfile)."""
    if sys.platform == "darwin":
        d = Path.home() / "Library" / "Application Support" / APP_VENDOR / "audio-daemon"
    elif os.name == "nt":
        d = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / APP_VENDOR / "audio-daemon"
    else:
        d = Path(os.environ.get("XDG_STATE_HOME", str(Path.home() / ".local" / "state"))) / "teamsigma-audiodaemon"
    d.mkdir(parents=True, exist_ok=True)
    return d


def log_dir() -> Path:
    """Per-user log dir (never /tmp — survives reboots, not world-readable)."""
    if sys.platform == "darwin":
        d = Path.home() / "Library" / "Logs"
    elif os.name == "nt":
        d = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / APP_VENDOR / "logs"
    else:
        d = Path(os.environ.get("XDG_STATE_HOME", str(Path.home() / ".local" / "state"))) / "teamsigma-audiodaemon"
    d.mkdir(parents=True, exist_ok=True)
    return d


def pidfile_path() -> Path:
    return state_dir() / "audio-daemon.pid"


def daemon_program_arguments() -> list[str]:
    """Command that launches the daemon, used in plist/unit/scheduled-task.

    Dev: the current interpreter + module. Packaged (PyInstaller one-file):
    the frozen executable directly.
    """
    if getattr(sys, "frozen", False):
        return [sys.executable, "--mode=daemon"]
    return [sys.executable, "-m", "audio_daemon", "--mode=daemon"]
