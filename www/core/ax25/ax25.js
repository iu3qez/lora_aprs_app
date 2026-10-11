// AX.25 UI frames: addresses, control, PID, information field.
//
// Matches what the CA2RXU tracker produces in KISS_Utils::encodeKISS():
// every SSID byte carries the reserved bits 0x60; bit 7 is set only on a
// digipeater that was starred in the TNC2 text (never the C bits on
// destination/source); the last address has bit 0 set.

export const CONTROL_UI = 0x03;
export const PID_NO_L3 = 0xf0;

const ADDRESS_LEN = 7;
const MAX_DIGIPEATERS = 8;
const H_BIT = 0x80;
const LAST_BIT = 0x01;
const RESERVED = 0x60;

export class AX25Error extends Error {}

function decodeAddress(bytes, offset) {
  let call = '';
  for (let i = 0; i < 6; i++) call += String.fromCharCode(bytes[offset + i] >> 1);
  const ssidByte = bytes[offset + 6];
  return {
    call: call.trimEnd(),
    ssid: (ssidByte >> 1) & 0x0f,
    hBit: (ssidByte & H_BIT) !== 0,
    last: (ssidByte & LAST_BIT) !== 0,
  };
}

// Decode the bytes of a KISS data frame. Destination and source ignore bit 7
// (C bits, never set by the firmware). Each digipeater reports its own H bit;
// the firmware sets it only where the TNC2 text had '*', so earlier addresses
// are not marked even when they were used.
export function decode(data) {
  const addresses = [];
  let offset = 0;
  for (;;) {
    if (offset + ADDRESS_LEN > data.length) throw new AX25Error('address field truncated');
    const a = decodeAddress(data, offset);
    addresses.push(a);
    offset += ADDRESS_LEN;
    if (a.last) break;
    if (addresses.length === 2 + MAX_DIGIPEATERS) throw new AX25Error('no last-address bit');
  }
  if (addresses.length < 2) throw new AX25Error('fewer than two addresses');
  if (offset + 2 > data.length) throw new AX25Error('control/PID missing');

  const [dst, src, ...digis] = addresses;
  return {
    destination: { call: dst.call, ssid: dst.ssid },
    source: { call: src.call, ssid: src.ssid },
    digipeaters: digis.map((d) => ({ call: d.call, ssid: d.ssid, repeated: d.hBit })),
    control: data[offset],
    pid: data[offset + 1],
    info: data.subarray(offset + 2),
  };
}

// AX.25 allows 1-6 upper-case letters/digits and SSID 0-15. The firmware would
// truncate a longer callsign and turn a non-numeric or >15 SSID into 0, so the
// encoder refuses them instead of sending a different station's address.
function encodeAddress({ call, ssid = 0 }, hBit, last) {
  if (!/^[A-Z0-9]{1,6}$/.test(call)) throw new AX25Error(`invalid callsign: ${call}`);
  if (!Number.isInteger(ssid) || ssid < 0 || ssid > 15) throw new AX25Error(`invalid SSID: ${ssid}`);
  const out = [];
  for (let i = 0; i < 6; i++) out.push((call.charCodeAt(i) || 0x20) << 1);
  out.push(RESERVED | (ssid << 1) | (hBit ? H_BIT : 0) | (last ? LAST_BIT : 0));
  return out;
}

export function encode({ destination, source, digipeaters = [], info, control = CONTROL_UI, pid = PID_NO_L3 }) {
  if (digipeaters.length > MAX_DIGIPEATERS) throw new AX25Error('more than 8 digipeaters');
  const out = [
    ...encodeAddress(destination, false, false),
    ...encodeAddress(source, false, digipeaters.length === 0),
  ];
  digipeaters.forEach((d, i) => out.push(...encodeAddress(d, d.repeated, i === digipeaters.length - 1)));
  out.push(control, pid, ...info);
  return Uint8Array.from(out);
}

// "CALL", "CALL-7". Accepts a trailing '*' (TNC2 repeated mark).
export function parseAddress(text) {
  const m = /^([A-Za-z0-9]+)(?:-(\d{1,2}))?(\*)?$/.exec(text);
  if (!m) throw new AX25Error(`invalid address: ${text}`);
  return { call: m[1], ssid: m[2] ? Number(m[2]) : 0, repeated: Boolean(m[3]) };
}

export function formatAddress({ call, ssid }) {
  return ssid ? `${call}-${ssid}` : call;
}

// TNC2 header "SRC>DST,DIGI1,DIGI2*". The star goes on the last digipeater
// with the H bit, which is the TNC2 convention and what the firmware emits.
export function formatHeader(frame) {
  let lastRepeated = -1;
  frame.digipeaters.forEach((d, i) => { if (d.repeated) lastRepeated = i; });
  const path = frame.digipeaters.map((d, i) => formatAddress(d) + (i === lastRepeated ? '*' : ''));
  return [`${formatAddress(frame.source)}>${formatAddress(frame.destination)}`, ...path].join(',');
}

// Whole TNC2 line as bytes: ASCII header, ':', information field unchanged.
export function toTNC2Bytes(frame) {
  const header = new TextEncoder().encode(formatHeader(frame) + ':');
  const out = new Uint8Array(header.length + frame.info.length);
  out.set(header);
  out.set(frame.info, header.length);
  return out;
}

// True when any digipeater has the H bit: the packet was heard after a repeat.
export function wasDigipeated(frame) {
  return frame.digipeaters.some((d) => d.repeated);
}
