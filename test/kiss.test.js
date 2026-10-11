import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { encode, Deframer, FEND } from '../www/core/kiss/kiss.js';

const oracle = JSON.parse(readFileSync(new URL('./fixtures/firmware-oracle.json', import.meta.url)));
const hex = (s) => Uint8Array.from(Buffer.from(s, 'hex'));
const toHex = (b) => Buffer.from(b).toString('hex');

function chunked(bytes, size) {
  const out = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.subarray(i, i + size));
  return out;
}

function deframeAll(chunks) {
  const d = new Deframer();
  return chunks.flatMap((c) => d.push(c));
}

test('encode escapes FEND and FESC and uses a single leading FEND', () => {
  assert.equal(toHex(encode([0x41, 0xc0, 0x42, 0xdb, 0x43])), 'c00041dbdc42dbdd43c0');
});

test('encode round-trips every firmware frame byte-exactly', () => {
  for (const c of oracle.encode) {
    const [frame] = deframeAll([hex(c.kiss)]);
    assert.equal(toHex(encode(frame.data, frame.command)), c.kiss, c.name);
  }
});

for (const size of [1, 20, 23, 512]) {
  test(`deframer reassembles all firmware frames concatenated, in ${size}-byte chunks`, () => {
    const stream = hex(oracle.encode.map((c) => c.kiss).join(''));
    const frames = deframeAll(chunked(stream, size));
    assert.equal(frames.length, oracle.encode.length);
    frames.forEach((f, i) => {
      assert.equal(toHex(encode(f.data, f.command)), oracle.encode[i].kiss, oracle.encode[i].name);
    });
  });
}

test('the firmware empty frame (invalid TNC2) is delivered with empty data', () => {
  const [f] = deframeAll([hex('c000c0')]);
  assert.deepEqual({ port: f.port, command: f.command, len: f.data.length }, { port: 0, command: 0, len: 0 });
});

test('consecutive FENDs produce no frames', () => {
  assert.equal(deframeAll([hex('c0c0c0')]).length, 0);
});

test('bytes before the first FEND are discarded and counted', () => {
  const d = new Deframer();
  const frames = d.push(hex('414243c00041c0'));
  assert.equal(frames.length, 1);
  assert.equal(d.discarded, 3);
});

test('a truncated frame is closed by the next FEND and the next frame survives', () => {
  const good = oracle.encode[0].kiss;
  const truncated = good.slice(0, 40); // MTU-3 cut: no closing FEND
  const frames = deframeAll([hex(truncated), hex(good)]);
  assert.equal(frames.length, 2);
  assert.equal(toHex(encode(frames[1].data)), good);
});

test('an escape split across two chunks is decoded', () => {
  const [f] = deframeAll([hex('c00041db'), hex('dc42c0')]);
  assert.equal(toHex(f.data), '41c042');
});

test('an invalid escape drops the pair and is reported', () => {
  const [f] = deframeAll([hex('c00041db4142c0')]);
  assert.equal(toHex(f.data), '4142');
  assert.equal(f.escapeErrors, 1);
});

test('port and command come from the two nibbles of the type byte', () => {
  const [f] = deframeAll([hex('c01041c0')]);
  assert.deepEqual([f.port, f.command], [1, 0]);
});

test('an oversized frame is dropped and the deframer resyncs on the next FEND', () => {
  const d = new Deframer();
  const big = new Uint8Array(1100).fill(0x41);
  assert.equal(d.push(Uint8Array.of(FEND, 0, ...big)).length, 0);
  const frames = d.push(hex('c00042c0'));
  assert.equal(frames.length, 1);
  assert.equal(toHex(frames[0].data), '42');
});
