/**
 * IPC wire protocol (browser side) — byte-for-byte parity with the daemon's
 * audio_daemon/protocol.py.
 *
 * Frame (little-endian): MAGIC(4) | Type(uint16) | Length(uint32) | Payload(JSON UTF-8)
 * Carried over a WebSocket as a binary frame.
 */
export const MSG = {
  HEARTBEAT: 0x0001,
  HEARTBEAT_ACK: 0x0002,
  TRIGGER_EVENT: 0x0003,
  TRIGGER_ACK: 0x0004,
  FOCUS_WINDOW: 0x0005,
  SHOW_WINDOW: 0x0006,
  CONFIG_UPDATED: 0x0007,
  DAEMON_STATUS: 0x0008,
  SHUTDOWN: 0x0009,
  RELOAD_MODEL: 0x000a,
};

export const NAMES = Object.fromEntries(Object.entries(MSG).map(([k, v]) => [v, k]));

const MAGIC = [0xa1, 0xd1, 0x0c, 0x01];
const HEADER = 10; // 4 + 2 + 4
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function encodeFrame(type, payload = {}) {
  // JSON.stringify defaults (no spaces, unicode preserved) match Python's
  // json.dumps(separators=(",", ":"), ensure_ascii=False).
  const body = textEncoder.encode(JSON.stringify(payload));
  const bytes = new Uint8Array(HEADER + body.length);
  const view = new DataView(bytes.buffer);
  bytes.set(MAGIC, 0);
  view.setUint16(4, type, true);
  view.setUint32(6, body.length, true);
  bytes.set(body, HEADER);
  return bytes;
}

export function decodeFrame(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < HEADER) throw new Error('frame shorter than header');
  if (!(bytes[0] === 0xa1 && bytes[1] === 0xd1 && bytes[2] === 0x0c && bytes[3] === 0x01)) {
    throw new Error('bad magic');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = view.getUint16(4, true);
  const length = view.getUint32(6, true);
  const body = bytes.subarray(HEADER, HEADER + length);
  if (body.length < length) throw new Error('truncated payload');
  const payload = length ? JSON.parse(textDecoder.decode(body)) : {};
  return { type, payload };
}
