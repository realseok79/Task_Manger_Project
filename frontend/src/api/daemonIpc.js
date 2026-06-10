/**
 * DaemonIpcClient — browser side of the DaemonIPCChannel.
 *
 * WebSocket to the daemon's /ipc endpoint carrying the binary framed protocol.
 * Handles reconnection (exponential backoff), an outbound queue while
 * disconnected (max 50, drop-oldest), heartbeat ACK, and TRIGGER auto-ACK.
 */
import { encodeFrame, decodeFrame, MSG } from '../lib/ipcProtocol.js';

const HTTP_BASE = import.meta?.env?.VITE_AUDIO_DAEMON_URL ?? 'http://localhost:8770';
const DEFAULT_URL = `${HTTP_BASE.replace(/^http/i, 'ws')}/ipc`;
const BACKOFF_MS = [100, 200, 400, 800, 1600]; // then steady 5s

export class DaemonIpcClient {
  constructor({ url = DEFAULT_URL, maxQueue = 50 } = {}) {
    this.url = url;
    this.maxQueue = maxQueue;
    this.onMessage = () => {}; // (type, payload) => void — set by the hook
    this.ws = null;
    this.connected = false;
    this.queue = []; // outbound frames buffered while disconnected
    this.attempt = 0;
    this._stopped = false;
    this._timer = null;
  }

  connect() {
    if (this.ws || this._stopped === false && this.connected) return this;
    this._stopped = false;
    this._open();
    return this;
  }

  stop() {
    this._stopped = true;
    clearTimeout(this._timer);
    if (this.ws) {
      try { this.ws.close(); } catch { /* noop */ }
    }
    this.ws = null;
    this.connected = false;
  }

  send(type, payload) {
    return this._sendFrame(encodeFrame(type, payload));
  }

  sendConfigUpdated(payload) {
    return this.send(MSG.CONFIG_UPDATED, payload);
  }

  // --- internals ---
  _open() {
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this._scheduleReconnect();
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.attempt = 0;
      this._flush();
    };
    ws.onmessage = (ev) => this._receive(ev.data);
    ws.onclose = () => {
      this.connected = false;
      this.ws = null;
      this._scheduleReconnect();
    };
    ws.onerror = () => {
      try { ws.close(); } catch { /* noop */ }
    };
  }

  _scheduleReconnect() {
    if (this._stopped) return;
    const delay = this.attempt < BACKOFF_MS.length ? BACKOFF_MS[this.attempt] : 5000;
    this.attempt += 1;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._open(), delay);
  }

  _flush() {
    const pending = this.queue;
    this.queue = [];
    for (const frame of pending) this._sendFrame(frame);
  }

  _sendFrame(frame) {
    if (this.connected && this.ws && this.ws.readyState === 1 /* WebSocket.OPEN */) {
      this.ws.send(frame);
      return true;
    }
    this.queue.push(frame);
    if (this.queue.length > this.maxQueue) this.queue.shift(); // drop oldest, cap at maxQueue
    return false;
  }

  _receive(data) {
    let msg;
    try {
      msg = decodeFrame(data);
    } catch {
      return;
    }
    const { type, payload } = msg;
    if (type === MSG.HEARTBEAT) {
      this.send(MSG.HEARTBEAT_ACK, { ts: Date.now() });
      return;
    }
    if (type === MSG.TRIGGER_EVENT) {
      this.send(MSG.TRIGGER_ACK, { id: payload.id }); // confirm receipt → daemon exits TRIGGERED
    }
    this.onMessage(type, payload);
  }
}

// Shared singleton so any component (hook, settings) uses one connection per tab.
export const daemonIpc = new DaemonIpcClient();
