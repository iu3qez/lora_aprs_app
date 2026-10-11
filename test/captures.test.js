// Replays raw BLE notification captures exported by www/harness/monitor.html.
// Drop a capture into test/fixtures/captures/ and it is tested; no code change.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';

import { Deframer, encode as kissEncode } from '../www/core/kiss/kiss.js';
import { decode, encode } from '../www/core/ax25/ax25.js';

const dir = new URL('./fixtures/captures/', import.meta.url);
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];

for (const file of files) {
  test(`capture ${file}: every frame reassembles, decodes and re-encodes byte-exactly`, () => {
    const capture = JSON.parse(readFileSync(new URL(file, dir)));
    const deframer = new Deframer();
    const frames = capture.chunks.flatMap((c) => deframer.push(Buffer.from(c.hex, 'hex')));
    assert.ok(frames.length > 0, 'capture holds no frames');
    assert.equal(deframer.discarded, 0, 'bytes discarded: the capture starts mid-frame or a FEND was lost');

    for (const f of frames) {
      assert.equal(f.port, 0);
      assert.equal(f.command, 0);
      assert.equal(f.escapeErrors, 0);
      if (f.data.length === 0) continue; // firmware's frame for a non-TNC2 line
      const ax = decode(f.data);
      if (!/^[A-Z0-9]+$/.test(ax.source.call)) continue; // decodable, not encodable
      assert.deepEqual(kissEncode(encode(ax)), kissEncode(f.data));
    }
  });
}
