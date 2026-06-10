"""Linux backend — systemd --user unit + linger (survives logout)."""
from __future__ import annotations

import getpass
import subprocess
from pathlib import Path

from .. import config

UNIT = config.LINUX_UNIT


def _unit_path() -> Path:
    return Path.home() / ".config" / "systemd" / "user" / UNIT


def _build_unit() -> str:
    exec_start = " ".join(config.daemon_program_arguments())
    return f"""[Unit]
Description=TeamSigma Audio Daemon
After=default.target sound.target
Wants=sound.target

[Service]
Type=simple
ExecStart={exec_start}
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=3s
Environment=AUDIO_DAEMON_PORT={config.DEFAULT_PORT}
# PipeWire/PulseAudio reachability from a --user service:
Environment=DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/%U/bus
Environment=PULSE_RUNTIME_PATH=/run/user/%U/pulse
# Lightweight hardening (kept loose enough to write logs/state under $HOME):
MemoryMax=150M
Nice=10
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=true
SyslogIdentifier=teamsigma-audiodaemon
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
"""


def _sc(*args: str) -> bool:
    try:
        return subprocess.run(["systemctl", "--user", *args], capture_output=True, text=True).returncode == 0
    except FileNotFoundError:
        return False


def set_autostart(enabled: bool) -> bool:
    path = _unit_path()
    if enabled:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(_build_unit())
        _sc("daemon-reload")
        try:  # survive logout
            subprocess.run(["loginctl", "enable-linger", getpass.getuser()], capture_output=True, text=True)
        except FileNotFoundError:
            pass
        return _sc("enable", "--now", UNIT)
    ok = _sc("disable", "--now", UNIT)
    try:
        path.unlink()
    except FileNotFoundError:
        pass
    _sc("daemon-reload")
    return ok or True


def get_autostart_status() -> bool:
    try:
        result = subprocess.run(
            ["systemctl", "--user", "is-enabled", UNIT], capture_output=True, text=True
        )
        return result.stdout.strip() == "enabled"
    except FileNotFoundError:
        return False


def start() -> bool:
    return _sc("start", UNIT)


def stop() -> bool:
    return _sc("stop", UNIT)


def restart() -> bool:
    return _sc("restart", UNIT)
