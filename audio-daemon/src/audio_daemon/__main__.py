"""Daemon entrypoint: ``python -m audio_daemon --mode=daemon``.

Writes a pidfile and runs the HTTP/WS server under a thin supervisor loop. The
supervisor restarts the server only on an unexpected crash (an exception
escaping uvicorn); a clean signal-driven shutdown returns normally and exits.
This complements the OS-level KeepAlive/Restart so the daemon recovers even from
in-process faults (notably on Windows, where Task Scheduler's restart is weak).
"""
from __future__ import annotations

import argparse
import sys
import time
from typing import Optional

from . import config, pidfile


def _run_server_once() -> None:
    import uvicorn

    from .server import create_app

    uvicorn.run(create_app(), host=config.DEFAULT_HOST, port=config.DEFAULT_PORT, log_level="info")


def run_daemon(supervise: bool = True) -> None:
    pidfile.write_pid()
    try:
        if not supervise:
            _run_server_once()
            return
        backoff = 1.0
        while True:
            started = time.time()
            try:
                _run_server_once()
                return  # clean shutdown (SIGTERM/SIGINT) → exit, don't restart
            except Exception as exc:  # noqa: BLE001 — supervisor must outlive faults
                print(f"[audio-daemon] server crashed: {exc}", file=sys.stderr)
            if time.time() - started > 30:
                backoff = 1.0  # ran healthily for a while → reset backoff
            time.sleep(backoff)
            backoff = min(backoff * 2, 30.0)
    finally:
        pidfile.clear_pid()


def _service_action(action: str) -> int:
    """Manage OS-service registration from the CLI (used by install scripts)."""
    import json

    from .service_manager import ServiceManager

    sm = ServiceManager()
    if action in ("register", "unregister"):
        ok = sm.set_autostart(action == "register")
        print(f"{action}: {'ok' if ok else 'failed'}")
        return 0 if ok else 1
    if action == "status":
        print(json.dumps({
            "running": sm.is_daemon_running(),
            "pid": sm.get_daemon_pid(),
            "autostart": sm.get_autostart_status(),
        }))
        return 0
    fn = {"start": sm.start_daemon, "stop": sm.stop_daemon, "restart": sm.restart_daemon}[action]
    ok = fn()
    print(f"{action}: {'ok' if ok else 'failed'}")
    return 0 if ok else 1


def main(argv: Optional[list] = None) -> int:
    parser = argparse.ArgumentParser(prog="audio_daemon")
    parser.add_argument("--mode", choices=["daemon", "oneshot"], default="daemon")
    parser.add_argument("--no-supervise", action="store_true", help="run the server without the restart loop")
    parser.add_argument(
        "--service",
        choices=["register", "unregister", "status", "start", "stop", "restart"],
        help="manage the OS service registration and exit (no daemon)",
    )
    args = parser.parse_args(argv)
    if args.service:
        return _service_action(args.service)
    run_daemon(supervise=(args.mode == "daemon" and not args.no_supervise))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
