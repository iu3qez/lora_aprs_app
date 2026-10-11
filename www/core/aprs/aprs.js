// APRS information field: data type identification, and build/parse of
// messages, acks and rejs (APRS 1.0.1 ch. 14, reply-ack from APRS 1.1).
// Position decoding is not here: only F17 needs it.

const DATA_TYPES = {
  '!': 'position',
  '=': 'position',
  '/': 'position',
  '@': 'position',
  '`': 'mic-e',
  "'": 'mic-e',
  ':': 'message',
  '>': 'status',
  ';': 'object',
  ')': 'item',
  'T': 'telemetry',
  '_': 'weather',
  '}': 'third-party',
  '<': 'capabilities',
  '?': 'query',
  '$': 'nmea',
  '{': 'user-defined',
};

export function dataType(info) {
  if (info.length === 0) return 'empty';
  return DATA_TYPES[String.fromCharCode(info[0])] ?? 'unknown';
}

// APRS is nominally ASCII; UTF-8 shows up in practice. Invalid sequences
// become U+FFFD rather than throwing: this is for display and parsing only,
// the raw bytes stay in the frame.
export function infoText(info) {
  return new TextDecoder('utf-8', { fatal: false }).decode(info);
}

const ADDRESSEE_LEN = 9;
export const MAX_MESSAGE_BYTES = 67;
const FORBIDDEN = /[|~{]/;

// ":ADDRESSEE:text{id", ":ADDRESSEE:ackid", ":ADDRESSEE:rejid".
// Returns null when the text is not a message. Message IDs are variable length:
// the firmware generates up to three digits, the spec allows up to five
// alphanumerics, and a reply-ack carries "{MM}AA".
export function parseMessage(text) {
  if (text[0] !== ':' || text[ADDRESSEE_LEN + 1] !== ':') return null;
  const addressee = text.slice(1, ADDRESSEE_LEN + 1).trimEnd();
  const body = text.slice(ADDRESSEE_LEN + 2);

  const ackRej = /^(ack|rej)([A-Za-z0-9]{1,5})(?:\}[A-Za-z0-9]{0,5})?\s*$/.exec(body);
  if (ackRej) return { addressee, kind: ackRej[1], msgId: ackRej[2] };

  const brace = body.lastIndexOf('{');
  if (brace === -1) return { addressee, kind: 'message', text: body, msgId: null, replyAck: null };

  const tail = /^\{([A-Za-z0-9]{1,5})(?:\}([A-Za-z0-9]{0,5}))?\s*$/.exec(body.slice(brace));
  if (!tail) return { addressee, kind: 'message', text: body, msgId: null, replyAck: null };
  return {
    addressee,
    kind: 'message',
    text: body.slice(0, brace),
    msgId: tail[1],
    replyAck: tail[2] === undefined ? null : tail[2],
  };
}

export class APRSError extends Error {}

function addresseeField(addressee) {
  if (addressee.length === 0 || addressee.length > ADDRESSEE_LEN) {
    throw new APRSError(`invalid addressee: ${addressee}`);
  }
  return addressee.padEnd(ADDRESSEE_LEN, ' ');
}

// The 67 limit is in bytes, not UTF-16 code units (F8).
export function buildMessage(addressee, text, msgId = null) {
  if (FORBIDDEN.test(text)) throw new APRSError('message text contains | ~ or {');
  if (new TextEncoder().encode(text).length > MAX_MESSAGE_BYTES) {
    throw new APRSError(`message text longer than ${MAX_MESSAGE_BYTES} bytes`);
  }
  if (msgId !== null && !/^[A-Za-z0-9]{1,5}$/.test(msgId)) throw new APRSError(`invalid msgId: ${msgId}`);
  return `:${addresseeField(addressee)}:${text}${msgId === null ? '' : `{${msgId}`}`;
}

export function buildAck(addressee, msgId) {
  return `:${addresseeField(addressee)}:ack${msgId}`;
}

export function buildRej(addressee, msgId) {
  return `:${addresseeField(addressee)}:rej${msgId}`;
}
