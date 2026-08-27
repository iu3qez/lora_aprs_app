# PRD — APRS Messenger (working title)

A **messaging-first** APRS client for the CA2RXU LoRa APRS tracker. The tracker
is the modem, the app is the interface.

## 1. Problem

Existing clients (APRSDroid and derivatives, APRS World, G7JJF) grew out of the
position report: messaging is a secondary tab, with no threads, no readable
delivery state, and no help at all for command services (APRS2SOTA, SMSGTE,
ANSRVR, WHO-IS, WXBOT). On a board with no keyboard the phone is the only way to
write a message, and today that route is awkward.

## 2. Goal

A single web codebase that:

- ships as a Capacitor **Android APK** — see §4 for why the PWA target was dropped;
- speaks KISS to **every CA2RXU firmware** (LoRa_APRS_Tracker on any supported
  board; whether LoRa_APRS_iGate exposes KISS over BT/TCP is unverified);
- treats every exchange as a conversation, and every APRS service as a form.

Non-goals: map, iGate, direct APRS-IS, digipeating, beaconing and position
tracking, mail of any kind (Winlink included). Those are tracker or gateway
functions. This is a messaging client, and the tracker already does its own job
without us.

## 3. User

A radio amateur operating portable (SOTA activations, contests) with a LoRa
tracker and an Android phone, usually with no network coverage. Secondarily: the
same operator at the shack, on Linux, with the tracker on USB.

## 4. Platform decision

The product surface is the Android APK. Web Bluetooth on Android Chrome has no
background access: the connection drops when the tab or the app is backgrounded,
or when the process is killed. The field use case that justifies the whole
project — messaging during an activation, phone in a pocket, screen off — is
therefore unreachable from a PWA by construction, not for lack of effort.

A browser-run build may survive as a development and debugging harness (working
on KISS/AX.25 parsing from a desktop without rebuilding the APK), but it is not
a product surface and no feature may depend on it.

Consequences: F20 is dropped. PWA storage-eviction concerns no longer apply.
F23 keeps its value as backup but loses its original PWA↔APK migration rationale.

## 5. Firmware constraints (verified against `main`, V2.4.3.2)

| Tracker mode | Transport | BLE service | Framing |
|---|---|---|---|
| `useBLE=true, useKISS=true` | BLE | `00000001-ba2a-46c9-ae49-01b0961f68bb`, TX(notify)=`…0003…`, RX(write)=`…0002…` | KISS, reassembled on FEND by the firmware |
| `useBLE=true, useKISS=false` | BLE | NUS `6E400001-…`, TX(notify)=`6E400002-…`, RX(write)=`6E400003-…` | TNC2 text, asymmetric: host→tracker **1 write = 1 packet**; tracker→host **one byte per BLE notification**, newline-terminated |
| `useBLE=false` (classic ESP32 only) | BT Classic SPP | — | KISS or TNC2 |
| USB serial | CP2102/CH340/USB-CDC (S3/C3) | — | KISS or TNC2 |

Decisions:

- **KISS is primary.** TNC2 is supported for RX and debugging only; on TX it is
  limited to packets smaller than MTU-3.
- The profile is detected from the advertised UUID. The user never picks one.
- BT Classic is unreachable from Web Bluetooth: APK only, via an SPP plugin, and
  low priority.
- S3/C3 boards are BLE-only, so BLE is the lowest common denominator.
- **The tracker is a transparent modem on TX, but not on RX.** Verified in the
  firmware source: a packet injected by the host over BLE goes straight to
  `LoRa_Utils::sendNewPacket()` without touching the firmware's own output buffer
  or retry ladder, so msgId, retry and timeout belong entirely to the app. On RX,
  however, the firmware acts on its own — see §5.1.
- **Transparent in content, not in cadence.** The firmware holds exactly one
  pending host packet — a single `BLEToLoRaPacket` string plus a flag, overwritten
  by every parsed frame and drained once per main loop, with a one-second blocking
  display call in the path. A second write arriving during a transmit **discards
  the first frame silently, with no error to the host.** The outbox must therefore
  serialize BLE writes to one frame at a time with a pacing gap; `write(bytes)`
  is not fire-and-forget.
- **The shipped defaults reach nothing.** `data/tracker_conf.json` ships with
  `bluetooth.active: false`, `useBLE: false`, `useKISS: false` — an untouched
  tracker has Bluetooth off entirely. The operator must set `active`, `useBLE`
  and `useKISS` true before the app can see anything. This does not weaken §5.2,
  but it does mean "usable on stock firmware" starts after a configuration step
  the app must explain rather than fail silently through.

### 5.1 What the firmware does without being asked

All of the following runs before the Bluetooth gate in the main loop, so it
happens even with no phone connected, and none of it has a configuration flag:

| Behaviour | Source |
|---|---|
| Auto-acks messages carrying `{msgId}` addressed to its own callsign | `msg_utils.cpp:442-443`, gated at `:434` |
| Replies `"pong, 73!"` to `ping` | `msg_utils.cpp:452` |
| Digipeats when `digipeaterActive` | `msg_utils.cpp:423-431` |
| Keeps its own pending-ack state | `msg_utils.cpp:437-441` |
| Deduplicates over a 15-second window — its own handling only, never the BLE forward | `check15SegBuffer()`, called at `:421` |
| Retries its own messages: 6 attempts at 0/30/60/120/120/120 s, then a 30 s expiry — about 8 minutes end to end | `msg_utils.cpp:338-364` |

Paths above refer to `richonguzman/LoRa_APRS_Tracker`, not to this repository.

Two consequences drive requirements below: the app must not auto-ack (F6), and
the app owns deduplication entirely (F7) — the firmware's 15-second window gates
only its own handling and never reaches the host.

### 5.2 Stock firmware is the contract

**The firmware as Ricardo ships it is the law.** The app targets unmodified
CA2RXU firmware and must be fully usable against it. Reading the source told us
what that contract actually is; it did not make the contract ours to change.

Firmware changes are asked for **one at a time, upstream, over time**, on their
own merits — never assumed, never bundled, and never a precondition for a
release. Concretely:

- No requirement may be specified as "works once the firmware is patched".
- Every feature that would benefit from a firmware change must define its
  behaviour on stock firmware first. That behaviour is the requirement; the
  patched behaviour is an enhancement.
- A merged upstream change is a capability the app may light up when present,
  detected at runtime — not a version the app demands.

This is a constraint on us, not a limitation of the project: an app that only
works against a private fork is an app nobody else can use.

## 6. Architecture

```
ui/            components (threads, composer, service forms, contacts, settings)
core/
  aprs/        build/parse: message, ack, rej; position decode only, and only
               because F17 needs it to compute distance
  ax25/        UI frame encode/decode, callsign+SSID, path, H-bit
  kiss/        FEND/FESC/TFEND/TFESC framing, reassembly from chunks
  services/    templates + response parsers, one per service
  outbox/      TX queue, msgId, retry with backoff, expiry
  store/       IndexedDB: threads, messages, contacts, heard, config
transport/     one interface: open(), write(bytes), onData(cb), close()
  cap-ble.js         @capacitor-community/bluetooth-le
  cap-serial.js      USB serial plugin (community or custom)
  web-serial.js      desktop, development harness only
```

Vanilla JS with ES modules, no mandatory build step. Capacitor consumes the same
`www/`.

## 7. Functional requirements

F-numbers are stable: issues reference them. A dropped requirement keeps its
number and is marked as such rather than renumbered.

### 7.1 Connection

- **F1.** Transport selection; automatic BLE profile detection (KISS vs TNC2).
- **F2.** Reconnect with backoff; connection state always visible.
- **F3.** Received KISS frames logged raw (hex + decode) in a monitor view.

### 7.2 Conversations

- **F4.** Thread per callsign-SSID, ordered by last activity. Threads and the
  heard list need a retention policy: after several activations the useful list
  is buried under one-off chasers from unrelated summits.
- **F5.** Every sent message shows msgId, attempts, ack/rej/timeout, and how it
  travelled (direct RF vs digipeated, read from the path H-bit). Hearing your own
  packet come back digipeated is **not** delivery and must not be rendered as such.
- **F6.** **The app does not transmit acks.** The firmware already auto-acks any
  message addressed to its own callsign (§5.1), so an app-side ack would put a
  second ack on the air for every message received. The app detects the
  firmware's ack passively in the RX stream instead. If app-side control turns
  out to be needed, it requires an upstream firmware flag, not a local workaround.
- **F7.** Deduplicate: same sender + msgId within N minutes. The firmware's own
  15-second dedup does **not** help here: `check15SegBuffer()` is called inside
  `checkReceivedMessage` and gates only the firmware's digipeat/ack/reply
  decisions, while the BLE forward sits outside that block and is unconditional —
  so the app receives every decoded duplicate. Size N against the peer retry
  ladder instead (§5.1): roughly eight minutes. The msgId parser must accept
  **variable-length** msgIds — the firmware generates up to three digits, while
  the spec's `{MM}` reply-ack is two characters.
- **F8.** Composer: **67-byte** counter, not 67 characters. The APRS limit is in
  bytes, and JavaScript string length counts UTF-16 code units, so accented text
  overruns a naive counter and truncates mid-character. Count with
  `new TextEncoder().encode(text).length`. Block disallowed characters
  (`|`, `~`, `{`); recipient from contacts or freetext.
- **F9.** Path selectable per message (default from config: `WIDE1-1`, none,
  custom).

### 7.3 Services (form → string → thread)

- **F10. APRS2SOTA**: summit reference, frequency, mode, comment → message to
  `SOTA`; parser for the confirmation/error reply.
- **F11. SMSGTE**: phone number + text; SMS replies mapped onto that number's thread.
- **F12. ANSRVR**: join/leave/CQ group; group messages in a per-group thread.
- **F13. WHO-IS**, **WXBOT/WXNOW**: quick queries.
- **F14.** ~~APRSLink (Winlink)~~ — **dropped**. Mail was never a requirement of
  this project, and the firmware runs its own unguarded Winlink state machine on
  any WLNK-1 traffic addressed to its callsign (`msg_utils.cpp:487-527`,
  challenge branch guarded by the tautology `winlinkStatus >= 1 || winlinkStatus
  <= 3`), so an app-driven session would contend with the firmware rather than
  merely duplicate it. Nothing here is worth the collision.
- **F15.** Services declared in JSON: name, destination, template with
  placeholders, response regex. Adding a service is adding a file. Response
  grammars are reverse-engineered and undocumented, so regexes are versioned
  defensively and a service may need several template variants.

### 7.4 Contacts and stations

- **F16.** Local contacts: alias, preferred SSID, notes. Subject to the retention
  policy of F4.
- **F17.** Heard stations: last-heard timestamp, distance when position is known,
  and RSSI/SNR **when available**. On stock firmware they are not: the firmware
  measures them and drops them before the BLE boundary. So the baseline
  requirement is a heard list that is genuinely useful without signal data — it
  still answers who is on air, how recently, and lets F18 start a thread. Signal
  quality is an enhancement that appears if an upstream patch lands (§5.2), and
  the UI must not be designed around a column that may stay empty.
- **F18.** Start a thread from a heard station with one tap.

### 7.5 Beacon

- **F19.** ~~Manual beacon~~ — **dropped**. Beaconing is a tracker function and
  the tracker already does it. There is also no mechanism: stock firmware exposes
  no host command channel, so the app could neither request a GPS fix nor trigger
  a beacon, and the only tracker position reaching the phone is its own
  autonomous beacon echo — itself gated on `useBLE`, so absent over USB and BT
  Classic.

### 7.6 Platform

- **F20.** ~~Installable PWA~~ — **dropped**, see §4.
- **F21.** Capacitor APK with a foreground service: BLE stays alive with the
  screen off, notification on inbound message. This is the only path to field
  use, not an enhancement. Permissions: `FOREGROUND_SERVICE`, plus
  `FOREGROUND_SERVICE_CONNECTED_DEVICE` with `foregroundServiceType="connectedDevice"`
  (API 34+, or `startForeground()` throws), `WAKE_LOCK`, and the runtime grants
  `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` (API 31+) and `POST_NOTIFICATIONS`
  (API 33+). These are launch blockers, not polish.
- **F22.** Everything works offline. No calls to the internet.
- **F23.** Export/import (JSON) for backup and device-to-device transfer.

## 8. Non-functional

- Reassembly must be robust against 20-byte BLE chunks and concatenated KISS
  frames, and — on the TNC2 receive path — against one-byte notifications
  delimited by newline.
- Unit tests on kiss/ax25/aprs against real packets captured from the tracker.
- No runtime dependency beyond Capacitor and the BLE plugin.
- **Latency.** The interval that matters is not the sub-200 ms hop from UI to BLE
  write — the operator never perceives it. What they perceive is the retry ladder,
  which lasts minutes. The useful control there is being able to cancel or amend a
  message before its next retry, not raw responsiveness.

## 9. Risks

- BLE MTU: negotiate on connect, split writes at MTU-3, never assume 20 or 247.
- iGate: if it does not expose KISS, it stays out of v1.
- Android process death: the app owns the whole retry loop, so an OEM battery
  manager killing the process mid-retry leaves a thread stuck on a state that will
  never update. Retry state has to survive and reconcile, or the display is lying.
- Channel behaviour: a messaging-first client transmits far more than a
  beacon-only tracker on a shared channel. The BLE TX path in the firmware has no
  listen-before-talk gate, so the app must implement its own.

## 10. Milestones

1. **M1 core**: kiss/ax25/aprs with tests; raw monitor over Web Serial on desktop.
2. **M2 messages**: threads, ack/retry, contacts; native BLE on Android.
3. **M3 services**: SOTA, SMSGTE, ANSRVR via JSON, plus F13's quick queries — the same declarative path.
4. **M4 APK**: Capacitor, foreground service, notifications.
5. **M5**: TNC2 fallback, USB serial.

## 11. UI references

No APRS client is a good reference. The right ones come from outside:

- **Meshtastic app (Android/iOS)**: the closest structural reference. Chat-first,
  channels and DMs as threads, node list with last-heard and SNR, per-message
  delivery state, map relegated to a tab. It also draws the distinction this
  project needs: delivered-to-mesh (relayed, unconfirmed) is not
  delivered-to-recipient.
- **Signal / Telegram**: thread model, composer, delivery states, long-press for
  detail. Copy the restraint, not the feature set.
- **Ham2K PoLo**: modern ham UI, fast one-handed, offline-first, few large
  buttons built for the field. Useful for the SOTA spot form.
- **SOTAmāt**: conceptual precedent for services-over-short-message; the UI is
  ugly but the form → compact string → send flow is the one.
- **Winlink Express**: what not to do (1998 density), but its explicit outbox
  with per-message state is worth keeping.
- **Briar**, as a warning: its usability review found showing "Message sent"
  before the message had left the device to be the top failure. Never claim a
  delivery state the evidence does not support.

Principles: one screen covers 90% of use (thread list → thread → composer); dark
theme by default; touch targets ≥ 48 px; no two-handed actions; connection state
and delivery state always readable at a glance.
