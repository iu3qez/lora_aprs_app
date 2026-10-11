import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  dataType, infoText, parseMessage, buildMessage, buildAck, buildRej, APRSError,
} from '../www/core/aprs/aprs.js';

const bytes = (s) => new TextEncoder().encode(s);

test('data type from the first information byte', () => {
  assert.equal(dataType(bytes('!4537.12N/01224.56E>')), 'position');
  assert.equal(dataType(bytes(':IU3QEZ-7 :hi')), 'message');
  assert.equal(dataType(bytes('`abc')), 'mic-e');
  assert.equal(dataType(bytes('>status')), 'status');
  assert.equal(dataType(new Uint8Array()), 'empty');
  assert.equal(dataType(bytes('x')), 'unknown');
});

test('infoText decodes UTF-8 and does not throw on invalid bytes', () => {
  assert.equal(infoText(bytes('perché')), 'perché');
  assert.equal(infoText(Uint8Array.of(0x41, 0xc0, 0x42)), 'A�B');
});

test('message with a firmware-style numeric msgId', () => {
  assert.deepEqual(parseMessage(':IU3QEZ-7 :hello{123'), {
    addressee: 'IU3QEZ-7', kind: 'message', text: 'hello', msgId: '123', replyAck: null,
  });
});

test('msgId is variable length, 1 to 5 alphanumerics', () => {
  assert.equal(parseMessage(':IU3QEZ-7 :a{7').msgId, '7');
  assert.equal(parseMessage(':IU3QEZ-7 :a{AB12c').msgId, 'AB12c');
});

test('reply-ack: {MM}AA and the empty {MM} form', () => {
  assert.deepEqual(parseMessage(':IU3QEZ-7 :hi{AB}CD'), {
    addressee: 'IU3QEZ-7', kind: 'message', text: 'hi', msgId: 'AB', replyAck: 'CD',
  });
  assert.equal(parseMessage(':IU3QEZ-7 :hi{AB}').replyAck, '');
});

test('message without msgId', () => {
  assert.deepEqual(parseMessage(':BLN1     :net tonight'), {
    addressee: 'BLN1', kind: 'message', text: 'net tonight', msgId: null, replyAck: null,
  });
});

test('ack and rej, with and without reply-ack suffix', () => {
  assert.deepEqual(parseMessage(':IU3QEZ-7 :ack123'), { addressee: 'IU3QEZ-7', kind: 'ack', msgId: '123' });
  assert.deepEqual(parseMessage(':IU3QEZ-7 :rejAB'), { addressee: 'IU3QEZ-7', kind: 'rej', msgId: 'AB' });
  assert.equal(parseMessage(':IU3QEZ-7 :ackAB}').msgId, 'AB');
});

test('text that starts with "ack" but is a message stays a message', () => {
  assert.equal(parseMessage(':IU3QEZ-7 :acknowledged, thanks{5').kind, 'message');
});

test('not a message', () => {
  assert.equal(parseMessage('>status'), null);
  assert.equal(parseMessage(':SHORT:x'), null);
});

test('build pads the addressee to 9 and round-trips', () => {
  const s = buildMessage('SOTA', 'S2S I/LO-123', '12');
  assert.equal(s, ':SOTA     :S2S I/LO-123{12');
  assert.equal(parseMessage(s).text, 'S2S I/LO-123');
  assert.equal(buildAck('IU3XYZ-9', '12'), ':IU3XYZ-9 :ack12');
  assert.equal(buildRej('IU3XYZ-9', '12'), ':IU3XYZ-9 :rej12');
});

test('67-byte limit counts bytes, not characters', () => {
  assert.doesNotThrow(() => buildMessage('X', 'a'.repeat(67)));
  assert.throws(() => buildMessage('X', 'è'.repeat(34)), APRSError); // 68 bytes, 34 chars
});

test('forbidden characters and bad addressees are refused', () => {
  for (const t of ['a|b', 'a~b', 'a{b']) assert.throws(() => buildMessage('X', t), APRSError, t);
  assert.throws(() => buildMessage('TOOLONGCALL', 'x'), APRSError);
  assert.throws(() => buildMessage('', 'x'), APRSError);
});
