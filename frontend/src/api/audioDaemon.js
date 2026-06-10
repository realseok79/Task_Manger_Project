/**
 * AudioDaemon API — the local native audio service (mic + OS-service control).
 *
 * Separate from api/client.js (the Spring Boot task API): the daemon is its own
 * process on a dedicated port to avoid the :8080 collision. Base URL is
 * configurable via VITE_AUDIO_DAEMON_URL; the WS URL is derived from it.
 */
const BASE = import.meta.env.VITE_AUDIO_DAEMON_URL ?? 'http://localhost:8770';

export const AUDIO_DAEMON_URL = BASE;
export const AUDIO_DAEMON_WS = `${BASE.replace(/^http/i, 'ws')}/stream/level`;

async function call(path, opts) {
  const res = await fetch(BASE + path, opts);
  if (!res.ok) throw new Error(`audio-daemon ${res.status}`);
  return res.status === 204 ? null : res.json();
}

const jsonPost = (path, body) =>
  call(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// Device + stream (existing UI contract)
export const getDevices = () => call('/devices');
export const selectDevice = (deviceId) => jsonPost('/devices/select', { device_id: deviceId });
export const controlStream = (action) => call(`/control/stream?action=${action}`, { method: 'POST' });

// Service layer (Start-at-Login toggle + supervision)
export const getStatus = () => call('/control/status');
export const setAutostart = (enabled) => jsonPost('/control/autostart', { enabled });
export const controlService = (action) => call(`/control/service?action=${action}`, { method: 'POST' });
