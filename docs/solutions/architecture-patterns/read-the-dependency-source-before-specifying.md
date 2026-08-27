---
title: Read an open-source dependency's source before writing requirements on it
date: 2026-08-27
last_updated: 2026-08-27
category: architecture-patterns
module: firmware-interface
problem_type: architecture_pattern
component: messaging
severity: high
applies_when:
  - Writing requirements that rest on how an external dependency behaves
  - The dependency is open source and its source is reachable
  - Splitting one protocol responsibility across two components that talk to each other
  - An agent reports code behaviour the orchestrator has not read
tags: [firmware, kiss, aprs, ax25, dependency-verification, protocol-ownership]
---

# Read an open-source dependency's source before writing requirements on it

## Context

The APRS Messenger PRD carried a numbered decision — number 5 — fixing how
protocol responsibility split between the app and the tracker:

> The tracker is a transparent modem, so msgId, ack, retry and dedup live in the app.

The assumption was not baseless: it is true on TX. But nobody had read the source
before writing it, and on RX it is false. Requirement F6 ("auto-ack received
messages carrying a msgId") rested on it, and would have put **two acks on the
air for every message received**, on a shared channel, with no test able to catch
it: both acks are valid, the protocol does not complain, and the symptom is
visible only from outside, with a third receiver listening.

## Guidance

**Before writing a requirement that depends on someone else's code, read that
code.** When the project is open source the uncertainty is not a real limit, it
is a decision not to look. A requirement written on an unverified assumption is
not a known risk — it is a defect already present in the specification, which
will be discovered in the field instead of at the desk.

In order:

1. **Read the source** and cite `file:line` for what you verified.
2. **If the source is genuinely ambiguous, ask the people who maintain it.** An
   upstream thread clarifies the present and gets you warned *before* the
   interface changes.
3. **Only then is a hypothesis legitimate**, stated as a hypothesis.

The cost of that loop, in this session, was a few minutes of `curl` and `grep`.
The cost of skipping it would have been discovering in the field that every
received message generates duplicate traffic.

### Reading is not only defensive

The same reading that prevented the bug also revealed an unused KISS command
byte, which became the project's main architectural lever, and four upstream
defects worth as many pull requests. Reading a dependency's source is the
shortest path to finding out what it could do and does not.

### What worked when the reading was delegated

Two constraints made the difference with subagents:

- **An explicit verification budget and mandatory citation.** Each agent had five
  targeted reads and had to ground every `direct:` claim in a line it actually
  read, never a citation reconstructed from memory.
- **Independent verification before anything was written down.** No agent claim
  entered an issue until the orchestrator re-read it in the source. All held —
  but the check is what lets you write "verified" instead of "an agent said so".

## Why it matters

Splitting one protocol responsibility across two components that talk to each
other is the kind of decision taken once that then structures everything else. If
it is taken on a wrong assumption, every requirement built on top inherits the
error, and the error manifests as behaviour on the air — not as an exception, not
as a red test.

## When to apply

- Before specifying any behaviour that depends on how a dependency behaves,
  rather than on how you would like it to behave.
- When two components share one responsibility (retry, dedup, identifiers,
  state): the question is not "who should do this" but "who is already doing it".
- When an agent, a README or a documentation page asserts a behaviour that will
  end up in a decision. READMEs overstate, issue trackers understate, source has
  no opinion.

## Example: what the tracker actually does

Verified against `richonguzman/LoRa_APRS_Tracker`, branch `main`. **Every
`src/...` path in this section belongs to that repository, not this one** — they
are deliberate upstream citations and are not to be looked for in the local tree.

**On TX, decision 5 holds.** A packet injected by the host over BLE does not go
through the firmware's buffer — `src/ble_utils.cpp:172`:

```cpp
LoRa_Utils::sendNewPacket(BLEToLoRaPacket);
```

No `addToOutputBuffer`, no `outputAckRequestBuffer`. Retry and msgId stay with
the app, with no overlap.

**On RX it does not.** The tracker acts on its own, and does so **before** the
Bluetooth gate at `src/LoRa_APRS_Tracker.cpp:219` — so it happens with the phone
switched off:

```cpp
MSG_Utils::checkReceivedMessage(packet);   // line 215
MSG_Utils::processOutputBuffer();          // line 216
MSG_Utils::clean15SegBuffer();

if (bluetoothActive && bluetoothConnected) {   // line 219
```

Inside `checkReceivedMessage`, under the gate
`addressee == currentBeacon->callsign` (`src/msg_utils.cpp:434`):

| Behaviour | Line |
|---|---|
| Auto-acks messages carrying `{msgId}` | `msg_utils.cpp:442-443` |
| Replies `"pong, 73!"` to `ping` | `msg_utils.cpp:452` |
| Digipeats when `digipeaterActive` | `msg_utils.cpp:423-431` |
| Keeps its own pending-ack state | `msg_utils.cpp:437-441` |
| Answers the Winlink challenge with its own password, guarded by a tautology | `msg_utils.cpp:487-527` |
| Deduplicates over 15 s — **its own handling only** | `check15SegBuffer()`, called at `:421` |
| Retries its own messages: 6 attempts at 0/30/60/120/120/120 s plus a 30 s expiry, about 8 minutes | `msg_utils.cpp:338-364` |

None of these has a disable flag.

### The consequence, and the trap inside it

Because the app uses the same callsign as the tracker, the gate at line 434 fires
for messages the app would otherwise handle. F6 was inverted: the app does not
transmit acks.

**The first attempt at the fix was itself wrong**, and that is the more valuable
half of this learning. F6 was rewritten to say the app "detects the firmware's
ack passively in the RX stream". It cannot. The firmware's own transmissions never
reach the host — `BLE_Utils::sendToPhone()` is called only with received packets
(`LoRa_APRS_Tracker.cpp:221`, `:225`) and with the tracker's own beacons
(`station_utils.cpp:256`) — and a single half-duplex SX12xx cannot hear itself.
The requirement named a mechanism that does not exist, in either software or
physics.

What works is **deterministic inference**: the app holds the same inbound frame
and knows the gate conditions from the source, so it can conclude the firmware
will ack. It renders that as inferred, never observed.

The general lesson: reading the source once fixes the requirement's *direction*.
Getting the *mechanism* right needs a second pass asking "and where exactly does
that data reach me?" — a question the first reading did not ask.

### A detail a second-hand summary would have inverted

`checkReceivedMessage` strips the `{msgId}` from the payload at line 444, but only
from its own internal copy. What goes to the phone is `packet.text.substring(3)`,
the raw frame. The app does see the msgId. A summary of a summary could easily
have reversed this, and the wrong parser would have been built on top.

## Related

- Issue #1 — double-retry verification, closed by this reading
- Issue #4 — F6 inverted
- Issue #2 — RSSI/SNR do not cross the BLE boundary; upstream PR required
- Issues #5, #6, #7, #8 — firmware defects found by the same reading
- [docs/PRD.md](../../PRD.md) — §5.1 and §5.2 carry these facts into requirements
