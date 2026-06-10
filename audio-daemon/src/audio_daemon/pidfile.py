"""PID file + liveness probe (used by ServiceManager.get_daemon_pid/is_running)."""
from __future__ import annotations

import os
from typing import Optional

from .config import pidfile_path


def write_pid(pid: int | None = None) -> None:
    pidfile_path().write_text(str(pid or os.getpid()))


def read_pid() -> Optional[int]:
    p = pidfile_path()
    if not p.exists():
        return None
    try:
        return int(p.read_text().strip())
    except (ValueError, OSError):
        return None


def clear_pid() -> None:
    try:
        pidfile_path().unlink()
    except FileNotFoundError:
        pass


def pid_alive(pid: int | None) -> bool:
    if not pid or pid <= 0:
        return False
    if os.name == "nt":
        import ctypes

        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        handle = ctypes.windll.kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if not handle:
            return False
        ctypes.windll.kernel32.CloseHandle(handle)
        return True
    try:
        os.kill(pid, 0)  # signal 0 = existence/permission probe, doesn't kill
    except ProcessLookupError:
        return False
    except PermissionError:
        return True  # exists, owned by someone else
    except OSError:
        return False
    return True
