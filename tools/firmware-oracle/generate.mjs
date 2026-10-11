// Generates test/fixtures/firmware-oracle.json by running the tracker firmware's
// own KISS codec (src/kiss_utils.cpp, compiled on the host by run.sh) on the
// cases below. Expected bytes therefore come from upstream code, not from a
// re-implementation in this repository.
//
//   node tools/firmware-oracle/generate.mjs <oracle-binary> <upstream-checkout>

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [oracle, upstream] = process.argv.slice(2);
if (!oracle || !upstream) {
  console.error('usage: generate.mjs <oracle-binary> <upstream-checkout>');
  process.exit(2);
}

const hex = (bytes) => Buffer.from(bytes).toString('hex');
const utf8 = (s) => Buffer.from(s, 'utf8');
const latin1 = (s) => Buffer.from(s, 'latin1');

// Tracker -> phone. The firmware forwards the LoRa payload (TNC2 text, after
// the 3-byte "<\xff\x01" prefix) through encodeKISS().
const encodeCases = [
  ['beacon with path', utf8('IU3QEZ-7>APLRT1,WIDE1-1:!4537.12N/01224.56E>test')],
  ['no path', utf8('IU3QEZ-7>APLRT1:>status')],
  ['message with msgId', utf8('IU3XYZ-9>APLRT1,WIDE1-1::IU3QEZ-7 :hello{123')],
  ['ack', utf8('IU3XYZ-9>APLRT1::IU3QEZ-7 :ack123')],
  ['reply-ack message', utf8('IU3XYZ-9>APLRT1::IU3QEZ-7 :hi{AB}CD')],
  ['digipeated, star on numbered alias', utf8('IU3XYZ-9>APLRT1,IR3UFO-10*,WIDE2-1:>status')],
  ['digipeated, star on bare alias', utf8('IU3XYZ-9>APLRT1,WIDE1*:>status')],
  ['two stars', utf8('IU3XYZ-9>APLRT1,IR3UFO-10*,IR3ABC-11*:>status')],
  ['eight digis', utf8('A>B,D1,D2,D3,D4,D5,D6,D7,D8:x')],
  ['FEND and FESC in info', latin1('IU3QEZ>APLRT1:>a\xc0b\xdbc')],
  ['UTF-8 info', utf8('IU3XYZ-9>APLRT1::IU3QEZ-7 :perché{7')],
  ['callsign longer than 6', utf8('IU3QEZAB>APLRT1:>x')],
  ['non-numeric SSID', utf8('IU3QEZ-AB>APLRT1:>x')],
  ['SSID 15', utf8('IU3QEZ-15>APLRT1:>x')],
  ['SSID 16 overflows', utf8('IU3QEZ-16>APLRT1:>x')],
  ['lowercase callsign', utf8('iu3qez>APLRT1:>x')],
  ['empty info field', utf8('IU3QEZ>APLRT1:')],
  ['not TNC2 at all', utf8('garbage without separators')],
  ['colon before >', utf8('A:B>C')],
];

// Phone -> tracker. What decodeKISS() turns a host frame into before it goes
// to LoRa_Utils::sendNewPacket(). Frame-level buffering (onWrite in
// ble_utils.cpp) is not compiled here; it needs NimBLE.
const decodeCases = [
  ['data frame, port 0', 'c00082a098a4a8626092aa66a28ab46eae92888a62406303f02174657374c0'],
  ['port 1 is not data', 'c01082a098a4a8626092aa66a28ab46eae92888a62406303f02174657374c0'],
  ['double leading FEND', 'c0c00082a098a4a8626092aa66a28ab46eae92888a62406303f02174657374c0'],
  ['C bits on dst and src are ignored', 'c00082a098a4a862e092aa66a28ab4eeae92888a62406303f02174657374c0'],
  ['H bit on a digi becomes a star', 'c00082a098a4a8626092aa66a28ab46eae92888a6240e303f02174657374c0'],
  ['escaped FEND and FESC in info', 'c00082a098a4a8626092aa66a28ab46103f03e61dbdc62dbdd63c0'],
  ['no digis', 'c00082a098a4a8626092aa66a28ab46103f03e78c0'],
];

const run = (mode, lines) =>
  execFileSync(oracle, [mode], { input: lines.join('\n') + '\n' }).toString().trim().split('\n');

const encoded = run('encode', encodeCases.map(([, b]) => hex(b)));
const decoded = run('decode', decodeCases.map(([, k]) => k));

const commit = execFileSync('git', ['-C', upstream, 'rev-parse', 'HEAD']).toString().trim();
const version = /versionNumber\s*=\s*"([^"]+)"/.exec(
  execFileSync('git', ['-C', upstream, 'show', 'HEAD:src/LoRa_APRS_Tracker.cpp']).toString(),
)[1];

const fixture = {
  provenance: {
    repository: 'richonguzman/LoRa_APRS_Tracker',
    commit,
    version,
    source: 'src/kiss_utils.cpp',
    generator: 'tools/firmware-oracle',
  },
  encode: encodeCases.map(([name, b], i) => ({ name, tnc2: hex(b), kiss: encoded[i] })),
  decode: decodeCases.map(([name, kiss], i) => {
    const [flag, out] = decoded[i].split(' ');
    return { name, kiss, dataFrame: flag === '1', tnc2: out ?? '' };
  }),
};

const target = fileURLToPath(new URL('../../test/fixtures/firmware-oracle.json', import.meta.url));
writeFileSync(target, JSON.stringify(fixture, null, 2) + '\n');
console.log(`wrote ${target}: ${fixture.encode.length} encode, ${fixture.decode.length} decode cases`);
