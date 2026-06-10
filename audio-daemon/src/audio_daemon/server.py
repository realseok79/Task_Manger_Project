"""FastAPI app: REST + WebSocket + CORS, matching the frontend's contract.

Existing endpoints the UI already calls:
  GET  /devices               -> [{id, name, host_api, is_default}]
  POST /devices/select        -> body {device_id}
  POST /control/stream?action=start|stop
  WS   /stream/level          -> {level_db, stream_active} frames

Service-layer endpoints for the "Start at Login" toggle:
  GET  /control/status        -> liveness + autostart + mic state
  POST /control/autostart     -> body {enabled}
  POST /control/service?action=start|stop|restart
"""
from __future__ import annotations

import asyncio
import os

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import config, permissions
from .audio import AudioEngine
from .clap import ClapConfig, ClapDetector
from .detection import DetectionSubscriber
from .edit_session import EditSession
from .health import ServerHealthMonitor
from .ipc import IpcHub
from .service_manager import ServiceManager
from .settings.orchestrator import ConfigReloadOrchestrator
from .settings.schema import Settings
from .settings.store import SettingsStore
from .settings.watcher import SettingsWatcher
from .wakeword import WakeWordDetector


def create_app(
    engine: AudioEngine | None = None,
    service: ServiceManager | None = None,
    ipc: IpcHub | None = None,
    health: ServerHealthMonitor | None = None,
) -> FastAPI:
    app = FastAPI(title="TeamSigma AudioDaemon", version="0.1.0")
    # Local-only daemon; the browser always hits it cross-origin (:5173/prod → :8770).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    engine = engine or AudioEngine()
    service = service or ServiceManager()
    ipc = ipc or IpcHub()
    health = health or ServerHealthMonitor()

    # Detection engine — all on the ONE mic stream via the broadcaster.
    # A clap/wake-word fires the existing IPC resurrection pipeline. Detection runs
    # on broadcaster worker threads, so it schedules the async emit_trigger onto the loop.
    def trigger_cb(event: dict) -> None:
        loop = getattr(app.state, "loop", None)
        if loop is not None:
            asyncio.run_coroutine_threadsafe(ipc.emit_trigger(event), loop)

    clap = ClapDetector(on_trigger=trigger_cb)
    wake = WakeWordDetector(threshold=config.WAKE_THRESHOLD, on_trigger=trigger_cb)
    detection_sub = DetectionSubscriber(clap, wake)

    # Settings persistence (daemon owns/writes the file; browser is a client).
    store = SettingsStore(config.settings_path())
    store.load()

    def broadcast_changes(keys) -> None:
        loop = getattr(app.state, "loop", None)
        if loop is not None:
            asyncio.run_coroutine_threadsafe(ipc.broadcast_config_updated(keys), loop)

    orchestrator = ConfigReloadOrchestrator(
        clap, wake, engine.broadcaster, service=service, on_broadcast=broadcast_changes
    )

    def persist_wake(meta: dict) -> None:
        # Enrollment committed → persist the new model + phrase so it reloads on restart.
        cur = store.current()
        ww = cur.wake_word.model_copy(update={
            "enabled": True,
            "phrase": meta.get("phrase") or cur.wake_word.phrase,
            "model_path": meta.get("model_path"),
            "enrolled_samples_count": meta.get("enrolled_samples_count", 0),
            "last_trained_at": meta.get("last_trained_at"),
        })
        store.save(cur.model_copy(update={"wake_word": ww}))

    edit = EditSession(
        engine.broadcaster, wake, config.AUDIO_FRAME_SIZE, config.ENROLLMENT_REPS,
        model_path=str(config.wakeword_model_path()), on_committed=persist_wake,
    )
    watcher = SettingsWatcher(store, on_external_change=orchestrator.apply_settings)

    app.state.engine = engine
    app.state.service = service
    app.state.ipc = ipc
    app.state.health = health
    app.state.clap = clap
    app.state.wake = wake
    app.state.edit = edit
    app.state.store = store
    app.state.orchestrator = orchestrator
    app.state.loop = None
    app.state.detection_token = None

    @app.on_event("startup")
    async def _on_startup():
        app.state.loop = asyncio.get_running_loop()
        app.state.detection_token = engine.broadcaster.subscribe(detection_sub)  # ACTIVE detector
        orchestrator.apply_initial(store.current(), start_capture=config.START_CAPTURE_ON_BOOT)
        watcher.start()
        health.start()

    @app.on_event("shutdown")
    async def _on_shutdown():
        watcher.stop()
        if app.state.detection_token is not None:
            engine.broadcaster.unsubscribe(app.state.detection_token)
        await health.stop()

    @app.get("/devices")
    def list_devices():
        return engine.list_devices()

    @app.post("/devices/select")
    async def select_device(request: Request):
        body = await request.json()
        device_id = int(body.get("device_id", 0))
        engine.select_device(device_id)
        return {"ok": True, "device_id": device_id}

    @app.post("/control/stream")
    def control_stream(action: str):
        if action == "start":
            engine.start()
        elif action == "stop":
            engine.stop()
        else:
            return JSONResponse({"ok": False, "error": "unknown action"}, status_code=400)
        return {"ok": True, "running": engine.running}

    @app.get("/control/status")
    def status():
        return {
            "running": True,
            "pid": os.getpid(),
            "autostart": service.get_autostart_status(),
            "stream_active": engine.running,
            "audio_available": engine.available,
            "mic_permission": engine.mic_permission(),
            "mic_hint": permissions.settings_hint(),
            "mic_settings_uri": permissions.settings_uri(),
            "port": config.DEFAULT_PORT,
            "app_connected": ipc.has_live_client(),
            "ipc_clients": ipc.client_count(),
            "last_heartbeat_ms": ipc.last_heartbeat_ms(),
            "backend_health": health.status(),
            "wake_threshold": wake.threshold,
            "edit": edit.status(),
        }

    @app.post("/control/autostart")
    async def set_autostart(request: Request):
        body = await request.json()
        enabled = bool(body.get("enabled", False))
        ok = service.set_autostart(enabled)
        return {"ok": ok, "autostart": service.get_autostart_status()}

    @app.post("/control/service")
    def control_service(action: str):
        actions = {
            "start": service.start_daemon,
            "stop": service.stop_daemon,
            "restart": service.restart_daemon,
        }
        fn = actions.get(action)
        if fn is None:
            return JSONResponse({"ok": False, "error": "unknown action"}, status_code=400)
        return {"ok": fn()}

    @app.websocket("/stream/level")
    async def stream_level(ws: WebSocket):
        await ws.accept()
        engine.start()  # ensure capture is live so the VU meter moves
        try:
            while True:
                # key is "dbfs" to match the frontend VUMeter parser
                await ws.send_json({"dbfs": engine.level_db(), "stream_active": engine.running})
                await asyncio.sleep(0.1)
        except WebSocketDisconnect:
            pass

    # IPC channel (daemon ↔ browser app): binary framed protocol over WebSocket.
    @app.websocket("/ipc")
    async def ipc_channel(ws: WebSocket):
        await ipc.handle_connection(ws)

    # Emit a trigger (resurrection pipeline). Test hook + the wake-word detector's entry point.
    @app.post("/control/trigger")
    async def control_trigger(request: Request):
        try:
            body = await request.json()
        except Exception:
            body = {}
        event = {
            "type": body.get("type", "WAKE_WORD"),
            "confidence": body.get("confidence", 1.0),
            "wake_phrase": body.get("wake_phrase"),
            "action": body.get("action", "FOCUS_OR_LAUNCH"),
        }
        result = await ipc.emit_trigger(event)
        return result

    # --- Wake-word re-enrollment (non-destructive; ACTIVE detector keeps running) ---
    @app.post("/wakeword/edit/start")
    async def edit_start(request: Request):
        body = await request.json()
        edit.open_edit(body.get("phrase", ""))
        return edit.status()

    @app.post("/wakeword/edit/record/start")
    def edit_record_start():
        edit.start_recording()
        return edit.status()

    @app.post("/wakeword/edit/record/cut")
    def edit_record_cut():
        reps = edit.cut_recording()  # finalize one rep from the live enrollment buffer
        return {"ok": True, "reps": reps, **edit.status()}

    @app.get("/wakeword/edit/status")
    def edit_status():
        return edit.status()

    @app.post("/wakeword/edit/save")
    def edit_save():
        return {"ok": edit.save(), **edit.status()}

    @app.post("/wakeword/edit/cancel")
    def edit_cancel():
        edit.cancel()
        return {"ok": True, **edit.status()}

    # --- Clap config hot-reload (no restart) ---
    @app.post("/clap/config")
    async def clap_config(request: Request):
        body = await request.json()
        current = clap._config  # snapshot to fill unspecified fields
        clap.update_config(ClapConfig(
            threshold_dbfs=float(body.get("threshold_dbfs", current.threshold_dbfs)),
            sensitivity=float(body.get("sensitivity", current.sensitivity)),
            require_double=bool(body.get("require_double", current.require_double)),
            double_window_ms=float(body.get("double_window_ms", current.double_window_ms)),
            refractory_ms=float(body.get("refractory_ms", current.refractory_ms)),
        ))
        return {"ok": True}

    # --- Persisted settings (daemon owns the file; atomic write + targeted hot-reload) ---
    @app.get("/settings")
    def get_settings():
        return store.current().model_dump()

    @app.put("/settings")
    async def put_settings(request: Request):
        body = await request.json()
        try:
            new = Settings.model_validate(body)
        except Exception as exc:  # ValidationError → 400
            return JSONResponse({"ok": False, "error": str(exc)}, status_code=400)
        old = store.current()
        store.save(new)                                   # atomic, crash-safe
        changed = orchestrator.apply_settings(old, new)   # targeted hot-reload + IPC notify
        return {"ok": True, "changed": sorted(changed), "settings": new.model_dump()}

    return app
