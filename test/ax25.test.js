import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Deframer, encode as kissEncode } from '../www/core/kiss/kiss.js';
import {
  decode, encode, parseAddress, formatHeader, toTNC2Bytes, wasDigipeated, AX25Error,
} from '../www/core/ax25/ax25.js';

const oracle = JSON.parse(readFileSync(new URL('./fixtures/firmware-oracle.json', import.meta.url)));
const hex = (s) => Uint8Array.from(Buffer.from(s, 'hex'));
const toHex = (b) => Buffer.from(b).toString('hex');
const latin1 = (b) => Buffer.from(b).toString('latin1');
const byName = (list, name) => list.find((c) => c.name === name);

function decodeKiss(kissHex) {
  const [frame] = new Deframer().push(hex(kissHex));
  return decode(frame.data);
}

// Tracker -> phone: frames the firmware's encodeKISS() produced from a TNC2 line.
// Cases where the TNC2 line is valid AX.25 must come back unchanged.
const lossless = [
  'beacon with path', 'no path', 'message with msgId', 'ack', 'reply-ack message',
  'digipeated, star on numbered alias', 'eight digis', 'FEND and FESC in info',
  'UTF-8 info', 'SSID 15', 'empty info field',
];

for (const name of lossless) {
  test(`decode firmware frame: ${name}`, () => {
    const c = byName(oracle.encode, name);
    assert.equal(latin1(toTNC2Bytes(decodeKiss(c.kiss))), latin1(hex(c.tnc2)));
  });
}

test('decode then encode reproduces every decodable firmware frame byte-exactly', () => {
  for (const c of oracle.encode) {
    const [frame] = new Deframer().push(hex(c.kiss));
    if (frame.data.length === 0) continue; // the empty frame for invalid TNC2
    const ax = decode(frame.data);
    if (!/^[A-Z0-9]+$/.test(ax.source.call)) continue; // lower case: decodable, not encodable
    assert.equal(toHex(kissEncode(encode(ax))), c.kiss, c.name);
  }
});

test('a bare starred alias decodes as repeated with SSID 0', () => {
  const ax = decodeKiss(byName(oracle.encode, 'digipeated, star on bare alias').kiss);
  assert.deepEqual(ax.digipeaters, [{ call: 'WIDE1', ssid: 0, repeated: true }]);
  assert.equal(formatHeader(ax), 'IU3XYZ-9>APLRT1,WIDE1*');
});

test('two starred digis: both H bits kept, TNC2 star on the last one', () => {
  const ax = decodeKiss(byName(oracle.encode, 'two stars').kiss);
  assert.deepEqual(ax.digipeaters.map((d) => d.repeated), [true, true]);
  assert.equal(formatHeader(ax), 'IU3XYZ-9>APLRT1,IR3UFO-10,IR3ABC-11*');
  assert.ok(wasDigipeated(ax));
});

test('an unstarred path is not digipeated', () => {
  assert.equal(wasDigipeated(decodeKiss(byName(oracle.encode, 'beacon with path').kiss)), false);
});

// The firmware's encoder loses information on these. The phone sees the lossy
// result; three different senders become the same IU3QEZ.
test('firmware truncates a callsign longer than 6', () => {
  assert.equal(formatHeader(decodeKiss(byName(oracle.encode, 'callsign longer than 6').kiss)), 'IU3QEZ>APLRT1');
});

test('firmware turns a non-numeric SSID into 0', () => {
  assert.equal(formatHeader(decodeKiss(byName(oracle.encode, 'non-numeric SSID').kiss)), 'IU3QEZ>APLRT1');
});

test('firmware turns SSID 16 into 0', () => {
  assert.equal(formatHeader(decodeKiss(byName(oracle.encode, 'SSID 16 overflows').kiss)), 'IU3QEZ>APLRT1');
});

test('lower case passes through the firmware and decodes as sent', () => {
  assert.equal(formatHeader(decodeKiss(byName(oracle.encode, 'lowercase callsign').kiss)), 'iu3qez>APLRT1');
});

// Phone -> tracker: what the firmware's decodeKISS() makes of a host frame
// is what goes on the air. Our decoder must read the same frame the same way.
for (const c of oracle.decode.filter((c) => c.dataFrame)) {
  test(`firmware and app read host frame the same way: ${c.name}`, () => {
    assert.equal(latin1(toTNC2Bytes(decodeKiss(c.kiss))), latin1(hex(c.tnc2)));
  });
}

test('a frame from the app encoder is a data frame to the firmware', () => {
  const frame = kissEncode(encode({
    destination: parseAddress('APLRT1'),
    source: parseAddress('IU3QEZ-7'),
    digipeaters: [parseAddress('WIDE1-1')],
    info: new TextEncoder().encode('!test'),
  }));
  assert.equal(toHex(frame), byName(oracle.decode, 'data frame, port 0').kiss);
});

test('encoder refuses addresses the firmware would mangle', () => {
  const base = { destination: parseAddress('APLRT1'), info: new Uint8Array() };
  for (const call of ['IU3QEZAB', 'iu3qez', 'IU3-QEZ', '']) {
    assert.throws(() => encode({ ...base, source: { call, ssid: 0 } }), AX25Error, call);
  }
  assert.throws(() => encode({ ...base, source: { call: 'IU3QEZ', ssid: 16 } }), AX25Error);
});

test('decoder rejects frames without a complete address field', () => {
  assert.throws(() => decode(hex('82a098a4a86260')), AX25Error);
  assert.throws(() => decode(hex('82a098a4a8626092aa66a28ab460')), AX25Error);
  assert.throws(() => decode(hex('82a098a4a8626092aa66a28ab461')), AX25Error);
});
