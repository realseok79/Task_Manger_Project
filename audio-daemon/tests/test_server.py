"""Smoke test for the HTTP contract the frontend depends on."""
from __future__ import annotations

import types

import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from audio_daemon.audio import AudioEngine  # noqa: E402
from audio_daemon.server import create_app  # noqa: E402


@pytest.fixture
def client():
    fake_service = types.SimpleNamespace(get_autostart_status=lambda: False)
    app = create_app(engine=AudioEngine(), service=fake_service)
    return TestClient(app)


def test_devices_shape(client):
    resp = client.get("/devices")
    assert resp.status_code == 200
    devices = resp.json()
    assert isinstance(devices, list) and devices
    # Exactly the keys the frontend reads.
    assert set(devices[0]) >= {"id", "name", "host_api", "is_default"}


def test_status_keys(client):
    body = client.get("/control/status").json()
    for key in ("running", "autostart", "stream_active", "mic_permission", "port"):
        assert key in body


def test_stream_bad_action_is_400(client):
    assert client.post("/control/stream", params={"action": "nope"}).status_code == 400


def test_select_device_ok(client):
    resp = client.post("/devices/select", json={"device_id": 0})
    assert resp.status_code == 200 and resp.json()["ok"] is True


def test_cors_header_present(client):
    resp = client.get("/devices", headers={"Origin": "http://localhost:5173"})
    assert resp.headers.get("access-control-allow-origin") == "*"
