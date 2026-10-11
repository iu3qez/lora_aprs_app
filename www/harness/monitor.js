// F3 raw monitor on the development harness: every KISS frame from the tracker
// as hex and decode, plus a capture of the raw BLE notifications that can be
// committed as a test fixture (test/fixtures/captures/).

import { Deframer, encode as kissEncode } from '../core/kiss/kiss.js';
import { decode, formatHeader, wasDigipeated } from '../core/ax25/ax25.js';
import { dataType, infoText, parseMessage } from '../core/aprs/aprs.js';
import { WebBleTransport, isSupported } from '../transport/web-ble.js';

const $ = (id) => document.getElementById(id);
const toHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

let transport = null;
let deframer = null;
let capture = null;
let t0 = 0;

function status(text) {
  $('status').textContent = text;
}

function cell(tr, text, cls) {
  const td = tr.insertCell();
  td.textContent = text; // RF data: never innerHTML
  if (cls) td.className = cls;
}

function describe(frame) {
  const ax = decode(frame.data);
  const text = infoText(ax.info);
  const type = dataType(ax.info);
  let detail = text;
  if (type === 'message') {
    const m = parseMessage(text);
    if (m) detail = JSON.stringify(m);
  }
  if (wasDigipeated(ax)) detail = `[digipeated] ${detail}`;
  return { header: formatHeader(ax), type, detail };
}

function showFrame(frame) {
  const tr = $('rows').insertRow(0);
  cell(tr, ((performance.now() - t0) / 1000).toFixed(1));
  cell(tr, String(frame.data.length));
  cell(tr, toHex(kissEncode(frame.data, (frame.port << 4) | frame.command)), 'hex');
  if (frame.port !== 0 || frame.command !== 0) {
    cell(tr, `port ${frame.port} command ${frame.command}`, 'err');
    return;
  }
  if (frame.data.length === 0) {
    cell(tr, 'empty data frame (firmware got a line that is not TNC2)', 'err');
    return;
  }
  try {
    const d = describe(frame);
    cell(tr, d.header);
    cell(tr, d.type);
    cell(tr, d.detail);
  } catch (e) {
    cell(tr, e.message, 'err');
  }
  if (frame.escapeErrors) cell(tr, `${frame.escapeErrors} invalid escape(s)`, 'err');
}

function onChunk(bytes) {
  capture.chunks.push({ t: Math.round(performance.now() - t0), hex: toHex(bytes) });
  for (const frame of deframer.push(bytes)) showFrame(frame);
  const sizes = capture.chunks.map((c) => c.hex.length / 2);
  status(`${transport.deviceName}: ${capture.chunks.length} notifications, largest ${Math.max(...sizes)} bytes, ${deframer.discarded} bytes discarded`);
}

async function connect() {
  transport = new WebBleTransport();
  deframer = new Deframer();
  transport.onData(onChunk);
  transport.onClose(() => {
    status(`${transport.deviceName}: disconnected`);
    $('connect').disabled = false;
    $('disconnect').disabled = true;
  });
  try {
    await transport.open();
  } catch (e) {
    status(`connect failed: ${e.message}`);
    return;
  }
  t0 = performance.now();
  capture = {
    provenance: {
      transport: 'web-bluetooth',
      device: transport.deviceName,
      startedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
    },
    chunks: [],
  };
  status(`${transport.deviceName}: connected, waiting for frames`);
  $('connect').disabled = true;
  $('disconnect').disabled = false;
  $('export').disabled = false;
}

function exportCapture() {
  const blob = new Blob([JSON.stringify(capture, null, 2) + '\n'], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `capture-${capture.provenance.startedAt.replace(/[:.]/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

if (!isSupported()) {
  status('Web Bluetooth not available: use desktop Chrome, served from localhost.');
  $('connect').disabled = true;
}
$('connect').addEventListener('click', connect);
$('disconnect').addEventListener('click', () => transport?.close());
$('export').addEventListener('click', exportCapture);
