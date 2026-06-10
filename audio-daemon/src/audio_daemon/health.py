"""ServerHealthMonitor — watches the real "localhost server" (Spring Boot :8080).

Spec analog: the spec runs this inside MainApp to restart a per-app FastAPI server.
Here the app is a browser SPA with no server of its own, so the always-on daemon
monitors the backend instead. It surfaces status (it cannot safely restart a Java
process); an optional launch command can be wired via env if desired.
"""
from __future__ import annotations

import asyncio
import time
import urllib.error
import urllib.request
from typing import Optional

from . import config


class ServerHealthMonitor:
    def __init__(self, url: Optional[str] = None, interval: Optional[float] = None):
        base = (url or config.BACKEND_URL).rstrip("/")
        self._url = base + config.BACKEND_HEALTH_PATH
        self._interval = interval if interval is not None else config.BACKEND_HEALTH_INTERVAL
        self._healthy = False
        self._checked_ms = 0
        self._task: Optional[asyncio.Task] = None

    def _probe(self) -> bool:
        try:
            urllib.request.urlopen(self._url, timeout=2.0)
            return True
        except urllib.error.HTTPError:
            return True   # responded (even 4xx/5xx) → server is up
        except Exception:
            return False  # connection refused / timeout → down

    async def check_once(self) -> bool:
        ok = await asyncio.to_thread(self._probe)
        self._healthy = ok
        self._checked_ms = int(time.time() * 1000)
        return ok

    async def _loop(self) -> None:
        try:
            while True:
                await self.check_once()
                await asyncio.sleep(self._interval)
        except asyncio.CancelledError:
            pass

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            self._task = None

    def is_server_running(self) -> bool:
        return self._healthy

    async def wait_for_server_ready(self, timeout: float = 10.0) -> bool:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if await self.check_once():
                return True
            await asyncio.sleep(0.2)
        return False

    def status(self) -> dict:
        return {"healthy": self._healthy, "url": self._url, "checked_ms": self._checked_ms}
