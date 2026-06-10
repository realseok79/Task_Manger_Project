"""ServiceManager + platform backends: assert the exact OS commands, with all
subprocess calls and $HOME mocked so the suite runs anywhere (no real services).
"""
from __future__ import annotations

import os
import types

import pytest

from audio_daemon import config, pidfile
from audio_daemon.platforms import linux, macos, windows
from audio_daemon.service_manager import ServiceManager


class FakeRun:
    """Records subprocess.run calls; returns a configurable result."""

    def __init__(self, returncode: int = 0, stdout: str = ""):
        self.calls: list[list[str]] = []
        self._rc = returncode
        self._stdout = stdout

    def __call__(self, args, *a, **kw):
        self.calls.append(list(args))
        return types.SimpleNamespace(returncode=self._rc, stdout=self._stdout, stderr="")

    def flat(self) -> str:
        return " ".join(" ".join(c) for c in self.calls)


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("XDG_STATE_HOME", str(tmp_path / "state"))
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path / "data"))
    return tmp_path


# ---------------- macOS ----------------
def test_macos_register_writes_plist_and_bootstraps(home, monkeypatch):
    fake = FakeRun(returncode=0)
    monkeypatch.setattr(macos.subprocess, "run", fake)

    assert macos.set_autostart(True) is True

    plist = home / "Library" / "LaunchAgents" / "com.teamsigma.audiodaemon.plist"
    assert plist.exists()
    body = plist.read_text()
    assert "com.teamsigma.audiodaemon" in body
    assert "RunAtLoad" in body and "KeepAlive" in body
    assert "launchctl bootstrap" in fake.flat()
    assert f"gui/{os.getuid()}" in fake.flat()


def test_macos_unregister_removes_plist(home, monkeypatch):
    monkeypatch.setattr(macos.subprocess, "run", FakeRun(0))
    macos.set_autostart(True)
    plist = home / "Library" / "LaunchAgents" / "com.teamsigma.audiodaemon.plist"
    assert plist.exists()

    assert macos.set_autostart(False) is True
    assert not plist.exists()


def test_macos_autostart_status(home, monkeypatch):
    monkeypatch.setattr(macos.subprocess, "run", FakeRun(0))
    assert macos.get_autostart_status() is False  # no plist yet
    macos.set_autostart(True)
    assert macos.get_autostart_status() is True   # plist present + launchctl print ok


# ---------------- Linux ----------------
def test_linux_register_writes_unit_and_enables(home, monkeypatch):
    fake = FakeRun(returncode=0)
    monkeypatch.setattr(linux.subprocess, "run", fake)

    assert linux.set_autostart(True) is True

    unit = home / ".config" / "systemd" / "user" / "teamsigma-audiodaemon.service"
    assert unit.exists()
    body = unit.read_text()
    assert "Type=simple" in body            # corrected from spec's Type=notify
    assert "ExecStart=" in body
    assert "Restart=on-failure" in body
    flat = fake.flat()
    assert "systemctl --user enable --now teamsigma-audiodaemon.service" in flat
    assert "enable-linger" in flat          # survive logout


def test_linux_autostart_status_enabled(home, monkeypatch):
    monkeypatch.setattr(linux.subprocess, "run", FakeRun(0, stdout="enabled\n"))
    assert linux.get_autostart_status() is True


# ---------------- Windows ----------------
def test_windows_register_calls_powershell(monkeypatch):
    fake = FakeRun(returncode=0)
    monkeypatch.setattr(windows.subprocess, "run", fake)

    assert windows.set_autostart(True) is True

    flat = fake.flat()
    assert "powershell" in flat
    assert "Register-ScheduledTask" in flat
    assert "TeamSigma_AudioDaemon" in flat
    assert "-AtLogOn" in flat


def test_windows_unregister(monkeypatch):
    fake = FakeRun(returncode=0)
    monkeypatch.setattr(windows.subprocess, "run", fake)
    assert windows.set_autostart(False) is True
    assert "Unregister-ScheduledTask" in fake.flat()


# ---------------- Facade ----------------
def test_service_manager_delegates_to_backend():
    calls = {}

    backend = types.SimpleNamespace(
        start=lambda: calls.setdefault("start", True),
        stop=lambda: calls.setdefault("stop", True),
        restart=lambda: calls.setdefault("restart", True),
        set_autostart=lambda e: calls.setdefault("set_autostart", e),
        get_autostart_status=lambda: True,
    )
    sm = ServiceManager(backend=backend)
    sm.start_daemon(); sm.stop_daemon(); sm.restart_daemon(); sm.set_autostart(True)
    assert calls == {"start": True, "stop": True, "restart": True, "set_autostart": True}
    assert sm.get_autostart_status() is True


def test_get_daemon_pid_uses_pidfile(home):
    pidfile.write_pid(os.getpid())
    sm = ServiceManager(backend=types.SimpleNamespace())
    assert sm.get_daemon_pid() == os.getpid()
    assert sm.is_daemon_running() is True
    pidfile.clear_pid()
    assert sm.get_daemon_pid() is None
