"""IPC wire protocol — binary frame serializer/deserializer.

Frame (little-endian):  MAGIC(4) | Type(uint16) | Length(uint32) | Payload(JSON UTF-8)

Transport here is a WebSocket carrying *binary* frames (a browser tab can't open a
Unix socket), but the frame format is transport-agnostic so a native Unix-socket /
named-pipe transport can reuse it unchanged behind the DaemonIPCChannel abstraction.
"""
from __future__ import annotations

import json
import struct
from typing import Tuple

MAGIC = b"\xA1\xD1\x0C\x01"
_HEADER = struct.Struct("<4sHI")  # magic, type (uint16), length (uint32)

# Message types — mirror the spec exactly.
HEARTBEAT = 0x0001
HEARTBEAT_ACK = 0x0002
TRIGGER_EVENT = 0x0003
TRIGGER_ACK = 0x0004
FOCUS_WINDOW = 0x0005
SHOW_WINDOW = 0x0006
CONFIG_UPDATED = 0x0007
DAEMON_STATUS = 0x0008
SHUTDOWN = 0x0009
RELOAD_MODEL = 0x000A

NAMES = {
    HEARTBEAT: "HEARTBEAT",
    HEARTBEAT_ACK: "HEARTBEAT_ACK",
    TRIGGER_EVENT: "TRIGGER_EVENT",
    TRIGGER_ACK: "TRIGGER_ACK",
    FOCUS_WINDOW: "FOCUS_WINDOW",
    SHOW_WINDOW: "SHOW_WINDOW",
    CONFIG_UPDATED: "CONFIG_UPDATED",
    DAEMON_STATUS: "DAEMON_STATUS",
    SHUTDOWN: "SHUTDOWN",
    RELOAD_MODEL: "RELOAD_MODEL",
}


def encode_frame(msg_type: int, payload: dict | None = None) -> bytes:
    body = json.dumps(payload or {}, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return _HEADER.pack(MAGIC, msg_type, len(body)) + body


def decode_frame(buf: bytes) -> Tuple[int, dict]:
    """Decode one complete frame (WebSocket preserves message boundaries)."""
    if len(buf) < _HEADER.size:
        raise ValueError("frame shorter than header")
    magic, msg_type, length = _HEADER.unpack(buf[: _HEADER.size])
    if magic != MAGIC:
        raise ValueError("bad magic")
    body = buf[_HEADER.size : _HEADER.size + length]
    if len(body) < length:
        raise ValueError("truncated payload")
    payload = json.loads(body.decode("utf-8")) if length else {}
    return msg_type, payload
