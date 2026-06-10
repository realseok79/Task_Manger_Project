# TeamSigma AudioDaemon

A small, always-on **local** process that owns the microphone and exposes an
HTTP/WS API on `127.0.0.1:8770` for the browser UI, plus a cross-platform
**ServiceManager** that registers the daemon as an OS-level **user** service so it
auto-starts at login, restarts on crash, and survives reboots/updates.

> Why a separate process? The app is a sandboxed browser web app — it cannot open
> the mic for a background service or register OS services. The daemon is the
> native piece; the browser talks to it only over `localhost` HTTP/WS.

## Run (dev)

```bash
cd audio-daemon
python3 -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
python -m audio_daemon --mode=daemon        # serves http://127.0.0.1:8770
```

Port is configurable: `AUDIO_DAEMON_PORT=9000 python -m audio_daemon`. It is
deliberately **not** :8080 (Spring Boot + the alarm-system Node backend both use that).

## HTTP / WS contract (consumed by the frontend)

| Method | Path | Purpose |
|---|---|---|
| GET | `/devices` | `[{id, name, host_api, is_default}]` |
| POST | `/devices/select` | body `{device_id}` |
| POST | `/control/stream?action=start\|stop` | start/stop mic capture |
| WS | `/stream/level` | `{dbfs, stream_active}` frames (VU meter) |
| GET | `/control/status` | `{running, pid, autostart, mic_permission, port, …}` |
| POST | `/control/autostart` | body `{enabled}` → register/unregister OS service |
| POST | `/control/service?action=start\|stop\|restart` | control the running service |

## Service registration

Driven from the UI ("로그인 시 자동 시작" toggle → `POST /control/autostart`) or the CLI:

```bash
python -m audio_daemon --service register      # enable auto-start at login
python -m audio_daemon --service unregister
python -m audio_daemon --service status
python -m audio_daemon --service start|stop|restart
```

Per platform (authoritative definitions generated in code; `service-templates/`
holds human-readable references):

| OS | Mechanism | Location |
|---|---|---|
| macOS | LaunchAgent (GUI session → mic) | `~/Library/LaunchAgents/com.teamsigma.audiodaemon.plist` |
| Linux | systemd `--user` + `loginctl enable-linger` | `~/.config/systemd/user/teamsigma-audiodaemon.service` |
| Windows | Task Scheduler "At log on", least privilege | task `TeamSigma_AudioDaemon` |

## Installer integration

`scripts/install-*.{sh,ps1}` create a per-user venv, install the package, and
register the service; `uninstall-*` reverse it. These are the hook points for a
macOS `.pkg` postinstall, a `.deb/.rpm` postinst, or an MSI deferred custom action.
For distribution, freeze a one-file binary with PyInstaller and point the service
definition at it (the code auto-detects `sys.frozen`).

## Microphone permission

- **macOS:** the LaunchAgent runs in the GUI session, so first capture triggers
  the system mic prompt; if denied, `/control/status.mic_permission == "denied"`
  and the UI links to Privacy → Microphone.
- **Windows:** Settings → Privacy → Microphone → "Let desktop apps access the microphone".
- **Linux:** no per-app gate; the unit injects `DBUS_SESSION_BUS_ADDRESS` and
  `PULSE_RUNTIME_PATH` so the user service can reach PipeWire/PulseAudio.

## Tests

```bash
pip install -e ".[dev]" && pytest
```

`tests/` mock all `subprocess` calls and `$HOME`, so they assert the exact
`launchctl` / `systemctl --user` / `schtasks` commands without touching the real OS.

## Scope

This package delivers the **service/registration layer** and a daemon real enough
to run and register (device list, capture, VU level, status/control). Actual
**wake-word / clap detection is out of scope** here — it layers onto the same
daemon later.
