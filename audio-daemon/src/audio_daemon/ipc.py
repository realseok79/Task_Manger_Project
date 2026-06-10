"""IPC hub (daemon side of DaemonIPCChannel) + app-resurrection pipeline.

Manages WebSocket clients (the browser app), heartbeats them, and delivers
TRIGGER_EVENTs. When no client is connected, "resurrects" the app by opening its
URL in the default browser, queues the trigger, and redelivers on connect.
No-loss: a trigger stays queued until it is ACKed, so it survives reconnects.
"""
from __future__ import annotations

import asyncio
import os
import subprocess
import sys
import time
import uuid
from typing import Callable, Dict, List, Optional

from fastapi import WebSocketDisconnect

from . import config
from .protocol import (
    CONFIG_UPDATED,
    DAEMON_STATUS,
    FOCUS_WINDOW,
    HEARTBEAT,
    HEARTBEAT_ACK,
    RELOAD_MODEL,
    TRIGGER_ACK,
    TRIGGER_EVENT,
    decode_frame,
    encode_frame,
)


def now_ms() -> int:
    return int(time.time() * 1000)


def open_app_url(url: str) -> bool:
    """Open the app URL in the default browser (the web equivalent of launching MainApp)."""
    try:
        if sys.platform == "darwin":
            subprocess.Popen(["open", url])
        elif os.name == "nt":
            os.startfile(url)  # type: ignore[attr-defined]
        else:
            subprocess.Popen(["xdg-open", url], env=dict(os.environ))  # DISPLAY/WAYLAND passthrough
        return True
    except Exception:
        return False


class _Client:
    def __init__(self, ws):
        self.ws = ws
        self.id = uuid.uuid4().hex
        self.last_ack_ms = now_ms()
        self.send_lock = asyncio.Lock()  # serialize concurrent sends (heartbeat vs trigger)

    async def send(self, msg_type: int, payload: dict) -> bool:
        try:
            async with self.send_lock:
                await self.ws.send_bytes(encode_frame(msg_type, payload))
            return True
        except Exception:
            return False


class IpcHub:
    def __init__(self, launcher: Callable[[str], bool] = open_app_url, on_config_updated=None):
        self._clients: Dict[str, _Client] = {}
        self._pending: Dict[str, dict] = {}          # trigger id -> event, kept until ACKed (no-loss)
        self._acks: Dict[str, asyncio.Event] = {}    # trigger id -> ack signal
        self._launcher = launcher
        self._on_config_updated = on_config_updated
        self._last_resurrect = 0.0

        # Tunables (overridable in tests).
        self.heartbeat_interval = config.IPC_HEARTBEAT_INTERVAL
        self.heartbeat_timeout_ms = config.IPC_HEARTBEAT_TIMEOUT_MS
        self.resurrect_debounce = config.IPC_RESURRECT_DEBOUNCE
        self.trigger_ack_timeout = config.IPC_TRIGGER_ACK_TIMEOUT

    # ---- introspection (for /control/status) ----
    def client_count(self) -> int:
        return len(self._clients)

    def has_live_client(self) -> bool:
        return bool(self._clients)

    def last_heartbeat_ms(self) -> Optional[int]:
        return max((c.last_ack_ms for c in self._clients.values()), default=None)

    # ---- connection lifecycle ----
    async def handle_connection(self, ws) -> None:
        await ws.accept()
        client = _Client(ws)
        self._clients[client.id] = client
        await self._flush_pending(client)  # redeliver any un-ACKed triggers
        hb_task = asyncio.create_task(self._heartbeat_loop(client))
        try:
            while True:
                data = await ws.receive_bytes()
                await self._on_message(client, data)
        except WebSocketDisconnect:
            pass
        except Exception:
            pass  # never crash on broken pipe / ECONNRESET
        finally:
            hb_task.cancel()
            self._clients.pop(client.id, None)

    async def _heartbeat_loop(self, client: _Client) -> None:
        try:
            while True:
                await asyncio.sleep(self.heartbeat_interval)
                if now_ms() - client.last_ack_ms > self.heartbeat_timeout_ms:
                    try:
                        await client.ws.close()
                    except Exception:
                        pass
                    return  # mark DEAD; read loop ends and unregisters
                if not await client.send(HEARTBEAT, {"ts": now_ms()}):
                    return
        except asyncio.CancelledError:
            pass

    async def _on_message(self, client: _Client, data: bytes) -> None:
        try:
            msg_type, payload = decode_frame(data)
        except ValueError:
            return
        if msg_type == HEARTBEAT_ACK:
            client.last_ack_ms = now_ms()
        elif msg_type == HEARTBEAT:
            client.last_ack_ms = now_ms()
            await client.send(HEARTBEAT_ACK, {"ts": now_ms()})
        elif msg_type == TRIGGER_ACK:
            self._resolve_ack(payload.get("id"))
        elif msg_type == CONFIG_UPDATED:
            await self._handle_config_updated(payload)

    # ---- trigger / resurrection pipeline ----
    async def emit_trigger(self, event: dict) -> dict:
        event.setdefault("id", uuid.uuid4().hex)
        event.setdefault("timestamp_ms", now_ms())
        tid = event["id"]
        self._pending[tid] = event
        ack_event = self._acks.setdefault(tid, asyncio.Event())

        resurrected = False
        if self.has_live_client():
            # Already running: focus the existing instance + deliver (no second launch).
            await self._broadcast(FOCUS_WINDOW, {"reason": "trigger", "id": tid})
            await self._broadcast(TRIGGER_EVENT, event)
        else:
            resurrected = self._resurrect()  # open app URL; trigger delivered on connect

        acked = await self._await_ack(ack_event)
        return {
            "id": tid,
            "delivered": self.has_live_client(),
            "resurrected": resurrected,
            "acked": acked,
        }

    def _resurrect(self) -> bool:
        now = time.monotonic()
        if now - self._last_resurrect < self.resurrect_debounce:
            return False  # debounce: don't spawn a tab per rapid trigger
        self._last_resurrect = now
        return bool(self._launcher(config.APP_URL))

    async def _await_ack(self, ack_event: asyncio.Event) -> bool:
        try:
            await asyncio.wait_for(ack_event.wait(), timeout=self.trigger_ack_timeout)
            return True
        except asyncio.TimeoutError:
            return False  # un-ACKed triggers stay pending for redelivery on next connect

    def _resolve_ack(self, tid: Optional[str]) -> None:
        if not tid:
            return
        self._pending.pop(tid, None)
        ev = self._acks.pop(tid, None)
        if ev:
            ev.set()

    async def _flush_pending(self, client: _Client) -> None:
        for event in list(self._pending.values()):
            await client.send(TRIGGER_EVENT, event)

    async def _broadcast(self, msg_type: int, payload: dict) -> None:
        for client in list(self._clients.values()):
            await client.send(msg_type, payload)

    async def _handle_config_updated(self, payload: dict) -> None:
        if "wake_word_model" in (payload.get("reload_required") or []):
            await self._broadcast(RELOAD_MODEL, {"source": "config"})  # internal hook (future detector)
        if self._on_config_updated:
            self._on_config_updated(payload)

    async def push_status(self, status: dict) -> None:
        await self._broadcast(DAEMON_STATUS, status)

    async def broadcast_config_updated(self, changed_keys) -> None:
        await self._broadcast(CONFIG_UPDATED, {"changed_keys": list(changed_keys), "ts": now_ms()})
