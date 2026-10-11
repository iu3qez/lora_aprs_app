// KISS framing (FEND/FESC/TFEND/TFESC), as spoken by the CA2RXU tracker.

export const FEND = 0xc0;
export const FESC = 0xdb;
export const TFEND = 0xdc;
export const TFESC = 0xdd;

export const CMD_DATA = 0x00;

// Larger than any LoRa APRS frame (LoRa payload <= 255 bytes); a frame that
// grows past this is a lost FEND, not data.
const MAX_FRAME = 1024;

// One frame, exactly one FEND on each side. The firmware's BLE onWrite treats
// a leading "FEND FEND" as a 2-byte frame, drops it, then discards the real
// frame up to its closing FEND: the conventional sync FEND would lose the packet.
export function encode(payload, command = CMD_DATA) {
  const out = [FEND, command & 0xff];
  for (const b of payload) {
    if (b === FEND) out.push(FESC, TFEND);
    else if (b === FESC) out.push(FESC, TFESC);
    else out.push(b);
  }
  out.push(FEND);
  return Uint8Array.from(out);
}

// Stream deframer. Every FEND is a frame boundary, so a frame truncated by the
// transport is closed by the next frame's leading FEND and the stream stays in
// step. Bytes before the first FEND ever seen are discarded: their frame start
// is unknown.
export class Deframer {
  #buf = [];
  #synced = false;
  #escape = false;
  #escapeErrors = 0;

  // Count of bytes thrown away (before first FEND, or in an oversized frame).
  discarded = 0;

  // Returns the complete frames contained in this chunk, in order. Each frame:
  // { port, command, data: Uint8Array, escapeErrors }. Empty FEND pairs yield
  // nothing; a frame holding only the command byte yields empty data.
  push(chunk) {
    const frames = [];
    for (const b of chunk) {
      if (b === FEND) {
        if (this.#synced && this.#buf.length > 0) frames.push(this.#emit());
        this.#reset();
        this.#synced = true;
        continue;
      }
      if (!this.#synced) {
        this.discarded++;
        continue;
      }
      if (this.#escape) {
        this.#escape = false;
        if (b === TFEND) this.#buf.push(FEND);
        else if (b === TFESC) this.#buf.push(FESC);
        else this.#escapeErrors++; // invalid escape: dropped, as the firmware does
        continue;
      }
      if (b === FESC) {
        this.#escape = true;
        continue;
      }
      this.#buf.push(b);
      if (this.#buf.length > MAX_FRAME) {
        this.discarded += this.#buf.length;
        this.#reset();
        this.#synced = false;
      }
    }
    return frames;
  }

  #emit() {
    const [type, ...data] = this.#buf;
    return {
      port: type >> 4,
      command: type & 0x0f,
      data: Uint8Array.from(data),
      escapeErrors: this.#escapeErrors,
    };
  }

  #reset() {
    this.#buf = [];
    this.#escape = false;
    this.#escapeErrors = 0;
  }
}
