"""IPC hub + resurrection pipeline tests.

Driven against IpcHub with a FakeWS (asyncio queues) so they're fast and need no
real browser/WebSocket; each test wraps an async body in asyncio.run (no
pytest-asyncio dependency).
"""
from __future__ import annotations

import asyncio
import time

import pytest
from fastapi import WebSocketDisconnect

from audio_daemon import config
from audio_daemon.ipc import IpcHub
from audio_daemon.protocol import (
    CONFIG_UPDATED,
    FOCUS_WINDOW,
    HEARTBEAT,
    TRIGGER_ACK,
    TRIGGER_EVENT,
    decode_frame,
    encode_frame,
)

_CLOSE = object()


class FakeWS:
    def __init__(self):
        self.inbox: asyncio.Queue = asyncio.Queue()   # client → hub
        self.outbox: asyncio.Queue = asyncio.Queue()  # hub → client
        self.closed = False

    async def accept(self):
        pass

    async def send_bytes(self, data):
        await self.outbox.put(data)

    async def receive_bytes(self):
        item = await self.inbox.get()
        if item is _CLOSE:
            raise WebSocketDisconnect(code=1000)
        return item

    async def close(self, *args, **kwargs):
        self.closed = True


async def _wait_for(pred, timeout=1.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if pred():
            return
        await asyncio.sleep(0.01)
    raise AssertionError("condition not met within timeout")


async def _read_frame(ws: FakeWS, want_type, timeout=2.0):
    deadline = time.monotonic() + timeout
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise AssertionError(f"frame {want_type} not received")
        data = await asyncio.wait_for(ws.outbox.get(), timeout=remaining)
        mtype, payload = decode_frame(data)
        if mtype == want_type:
            return payload


def _hub(launcher):
    hub = IpcHub(launcher=launcher)
    hub.heartbeat_interval = 100  # suppress heartbeats during tests
    return hub


def test_trigger_when_dead_launches_and_delivers():
    async def body():
        launched = []
        hub = _hub(lambda url: launched.append(url) or True)
        hub.trigger_ack_timeout = 2.0

        emit = asyncio.create_task(hub.emit_trigger({"id": "t1", "type": "WAKE_WORD"}))
        await _wait_for(lambda: launched, 1.0)
        assert launched == [config.APP_URL]  # resurrection: opened the app URL

        ws = FakeWS()
        conn = asyncio.create_task(hub.handle_connection(ws))
        payload = await _read_frame(ws, TRIGGER_EVENT)   # queued trigger redelivered on connect
        assert payload["id"] == "t1"

        await ws.inbox.put(encode_frame(TRIGGER_ACK, {"id": "t1"}))
        result = await emit
        assert result["resurrected"] is True and result["acked"] is True

        await ws.inbox.put(_CLOSE)
        await conn

    asyncio.run(body())


def test_trigger_when_alive_focuses_not_launch():
    async def body():
        launched = []
        hub = _hub(lambda url: launched.append(url) or True)

        ws = FakeWS()
        conn = asyncio.create_task(hub.handle_connection(ws))
        await _wait_for(lambda: hub.client_count() == 1)

        emit = asyncio.create_task(hub.emit_trigger({"id": "t2", "type": "WAKE_WORD"}))
        await _read_frame(ws, FOCUS_WINDOW)               # focus existing instance...
        trigger = await _read_frame(ws, TRIGGER_EVENT)    # ...then deliver
        assert trigger["id"] == "t2"
        assert launched == []                             # NO second browser launch

        await ws.inbox.put(encode_frame(TRIGGER_ACK, {"id": "t2"}))
        result = await emit
        assert result["acked"] is True and result["resurrected"] is False

        await ws.inbox.put(_CLOSE)
        await conn

    asyncio.run(body())


def test_no_loss_across_reconnect():
    async def body():
        hub = _hub(lambda url: True)
        hub.trigger_ack_timeout = 0.3

        a = FakeWS()
        ca = asyncio.create_task(hub.handle_connection(a))
        await _wait_for(lambda: hub.client_count() == 1)

        emit = asyncio.create_task(hub.emit_trigger({"id": "t3", "type": "X"}))
        await _read_frame(a, TRIGGER_EVENT)               # A receives it...
        await a.inbox.put(_CLOSE)                          # ...then dies WITHOUT acking
        await ca
        result = await emit
        assert result["acked"] is False                   # un-ACKed → stays pending

        b = FakeWS()
        cb = asyncio.create_task(hub.handle_connection(b))
        redelivered = await _read_frame(b, TRIGGER_EVENT)  # no loss: redelivered to B
        assert redelivered["id"] == "t3"

        await b.inbox.put(_CLOSE)
        await cb

    asyncio.run(body())


def test_config_updated_roundtrip_under_100ms():
    async def body():
        got = {}

        def on_cfg(payload):
            got["at"] = time.monotonic()
            got["payload"] = payload

        hub = IpcHub(launcher=lambda url: True, on_config_updated=on_cfg)
        hub.heartbeat_interval = 100

        ws = FakeWS()
        conn = asyncio.create_task(hub.handle_connection(ws))
        await _wait_for(lambda: hub.client_count() == 1)

        sent = time.monotonic()
        await ws.inbox.put(encode_frame(CONFIG_UPDATED, {"changed_keys": ["wake_word.phrase"]}))
        await _wait_for(lambda: "payload" in got, 1.0)

        assert (got["at"] - sent) * 1000 < 100
        assert got["payload"]["changed_keys"] == ["wake_word.phrase"]

        await ws.inbox.put(_CLOSE)
        await conn

    asyncio.run(body())


def test_codec_roundtrip():
    cases = [
        (TRIGGER_EVENT, {"id": "abc", "type": "WAKE_WORD", "confidence": 0.94}),
        (HEARTBEAT, {}),
        (CONFIG_UPDATED, {"changed_keys": ["a", "b"]}),
    ]
    for mtype, payload in cases:
        decoded_type, decoded_payload = decode_frame(encode_frame(mtype, payload))
        assert decoded_type == mtype
        assert decoded_payload == payload

    with pytest.raises(ValueError):
        decode_frame(b"\x00\x00\x00\x00\x01\x00\x00\x00\x00\x00")  # bad magic
