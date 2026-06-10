/**
 * IPC client/codec unit tests — plain Node (matches the repo's *.node.mjs convention;
 * no test runner is installed). Run: node src/lib/__tests__/ipcProtocol.node.mjs
 */
import assert from 'node:assert/strict';
import { encodeFrame, decodeFrame, MSG } from '../ipcProtocol.js';
import { DaemonIpcClient } from '../../api/daemonIpc.js';

// 1. Codec round-trip
for (const [type, payload] of [
  [MSG.TRIGGER_EVENT, { id: 'abc', type: 'WAKE_WORD', confidence: 0.94 }],
  [MSG.HEARTBEAT, {}],
  [MSG.CONFIG_UPDATED, { changed_keys: ['a', 'b'] }],
]) {
  const { type: t, payload: p } = decodeFrame(encodeFrame(type, payload));
  assert.equal(t, type);
  assert.deepEqual(p, payload);
}

// 2. Byte-for-byte parity with the Python daemon (protocol.py) for a known frame
const golden = Uint8Array.from([
  0xa1, 0xd1, 0x0c, 0x01, // MAGIC
  0x03, 0x00, // type=TRIGGER_EVENT, little-endian
  0x0a, 0x00, 0x00, 0x00, // length=10
  0x7b, 0x22, 0x69, 0x64, 0x22, 0x3a, 0x22, 0x78, 0x22, 0x7d, // {"id":"x"}
]);
assert.deepEqual(encodeFrame(MSG.TRIGGER_EVENT, { id: 'x' }), golden);

// 3. Bad magic rejected
assert.throws(() => decodeFrame(Uint8Array.from([0, 0, 0, 0, 1, 0, 0, 0, 0, 0])));

// 4. Outbound queue caps at maxQueue, dropping oldest (spec: max 50)
{
  const client = new DaemonIpcClient({ maxQueue: 3 });
  for (let n = 1; n <= 5; n += 1) client.send(MSG.TRIGGER_ACK, { n }); // disconnected → queued
  assert.equal(client.queue.length, 3);
  const ns = client.queue.map((f) => decodeFrame(f).payload.n);
  assert.deepEqual(ns, [3, 4, 5]); // kept newest, dropped 1 & 2
}

// 5. No message loss across reconnect: queued frames flush in order on (re)connect
{
  const client = new DaemonIpcClient({ maxQueue: 50 });
  for (let n = 1; n <= 3; n += 1) client.send(MSG.TRIGGER_ACK, { n });
  assert.equal(client.queue.length, 3);

  const sent = [];
  client.connected = true;
  client.ws = { readyState: 1, send: (frame) => sent.push(frame) };
  client._flush();

  assert.equal(client.queue.length, 0);
  assert.deepEqual(sent.map((f) => decodeFrame(f).payload.n), [1, 2, 3]);
}

console.log('ipcProtocol.node.mjs: all assertions passed');
