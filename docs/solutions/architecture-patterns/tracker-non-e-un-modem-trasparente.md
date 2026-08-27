---
title: Il contratto di una dipendenza open source si legge nel sorgente, non si assume
date: 2026-08-27
category: architecture-patterns
module: firmware-interface
problem_type: architecture_pattern
component: messaging
severity: high
applies_when:
  - Si scrivono requisiti che poggiano sul comportamento di una dipendenza esterna
  - La dipendenza è open source e il sorgente è raggiungibile
  - Si sta dividendo una responsabilità di protocollo fra due componenti che si parlano
  - Un agente riporta il comportamento di codice che l'orchestratore non ha letto
tags: [firmware, kiss, aprs, ax25, verifica-dipendenze, ownership-protocollo]
---

# Il contratto di una dipendenza open source si legge nel sorgente, non si assume

## Contesto

Il PRD di APRS Messenger conteneva una decisione numerata — la 5 — che stabiliva
la divisione delle responsabilità di protocollo fra app e tracker:

> Il tracker è un modem trasparente, quindi msgId, ack, retry e dedup stanno
> nell'app.

L'assunzione non era campata in aria: è vera in TX. Ma nessuno aveva letto il
sorgente prima di scriverla, e in RX è falsa. Su quell'assunzione poggiava il
requisito F6 («auto-ack dei messaggi ricevuti con msgId»), che avrebbe mandato
**due ack in aria per ogni messaggio ricevuto**, su un canale condiviso, senza
che nessun test lo avrebbe segnalato: entrambi gli ack sono validi, il
protocollo non se ne lamenta, e il sintomo si vede solo dall'esterno, con un
ricevitore in ascolto.

## Guida

**Prima di scrivere un requisito che dipende dal comportamento di codice altrui,
leggi quel codice.** Se il progetto è open source, l'incertezza non è un limite
reale: è una scelta di non guardare. Un requisito scritto su un'assunzione non
verificata non è un rischio noto — è un difetto già presente nella specifica,
che verrà scoperto in campo invece che a tavolino.

Il pattern operativo, in ordine:

1. **Leggi il sorgente** e cita `file:riga` di ciò che hai verificato.
2. **Se il sorgente resta ambiguo**, chiedi a chi lo mantiene. Un thread upstream
   chiarisce il presente e ti fa avvisare *prima* che l'interfaccia cambi.
3. **Solo allora è lecito ipotizzare**, dichiarando che è un'ipotesi.

Il costo di questo giro, in questa sessione, è stato di pochi minuti di `curl` e
`grep`. Il costo di saltarlo sarebbe stato scoprire in attivazione che ogni
messaggio ricevuto genera traffico doppio.

### Il metodo che ha funzionato con gli agenti

Quando la lettura è delegata a subagent, due vincoli hanno fatto la differenza:

- **Budget di verifica esplicito e citazione obbligatoria.** Ogni agente aveva
  cinque letture mirate e l'obbligo di fondare ogni affermazione `direct:` su una
  riga letta davvero, mai su una citazione ricostruita a memoria.
- **Verifica indipendente prima di scrivere.** Nessuna affermazione di un agente
  è entrata in una issue senza che l'orchestratore la rileggesse nel sorgente.
  Tutte hanno retto, ma il controllo non era rituale: è ciò che permette di
  scrivere «verificato» invece di «secondo un agente».

## Perché conta

La divisione delle responsabilità di protocollo fra due componenti che si parlano
è il tipo di decisione che si prende una volta e poi struttura tutto il resto.
Se la si prende su un'assunzione sbagliata, ogni requisito costruito sopra eredita
l'errore, e l'errore si manifesta come comportamento in aria — non come eccezione,
non come test rosso.

C'è anche un rovescio positivo. Aver letto il firmware non ha solo evitato un bug:
ha rivelato un canale inutilizzato (il command byte KISS) che è diventato la leva
architetturale principale del progetto, e quattro difetti upstream che valgono
altrettante PR. Leggere il sorgente di una dipendenza non è solo difesa — è la
via più corta per scoprire cosa quella dipendenza potrebbe fare e non fa.

## Quando applicarlo

- Prima di specificare qualsiasi comportamento che dipende da come si comporta
  una dipendenza, non da come vorresti che si comportasse.
- Quando due componenti si dividono la stessa responsabilità (retry, dedup,
  identificatori, stato): la domanda non è «chi dovrebbe farlo» ma «chi lo sta
  già facendo».
- Quando un agente, un README o una documentazione affermano un comportamento
  che finirà in una decisione. I README sovrastimano, gli issue tracker
  sottostimano, il sorgente non ha opinioni.

## Esempio: cosa fa davvero il tracker

Verificato su `richonguzman/LoRa_APRS_Tracker`, branch `main`. **Tutti i percorsi
`src/...` di questa sezione appartengono a quel repository, non a questo**: sono
citazioni upstream intenzionali e non vanno cercate nell'albero locale.

**In TX la decisione 5 regge.** Un pacchetto iniettato dall'host via BLE non
passa dal buffer del firmware — `src/ble_utils.cpp:172`:

```cpp
LoRa_Utils::sendNewPacket(BLEToLoRaPacket);
```

Nessun `addToOutputBuffer`, nessun `outputAckRequestBuffer`. Retry e msgId
restano all'app, senza sovrapposizione.

**In RX no.** Il tracker agisce di testa sua, e lo fa **prima** del gate
Bluetooth di `src/LoRa_APRS_Tracker.cpp:219` — quindi anche a telefono spento:

```cpp
MSG_Utils::checkReceivedMessage(packet);   // riga 215
MSG_Utils::processOutputBuffer();          // riga 216
MSG_Utils::clean15SegBuffer();

if (bluetoothActive && bluetoothConnected) {   // riga 219
```

Dentro `checkReceivedMessage`, sotto il gate
`addressee == currentBeacon->callsign` (`src/msg_utils.cpp:434`):

| Comportamento | Riga |
|---|---|
| Auto-ack dei messaggi con `{msgId}` | `msg_utils.cpp:442-443` |
| Risposta `"pong, 73!"` a `ping` | `msg_utils.cpp:452` |
| Digipeat se `digipeaterActive` | `msg_utils.cpp:423-431` |
| Stato di ack pendente proprio | `msg_utils.cpp:437-441` |
| Dedup a 15 secondi | `check15SegBuffer()` |
| Retry a 6 tentativi, backoff 30/60/120 s | `msg_utils.cpp:321-343` |

Nessuno di questi ha un flag di disattivazione.

**La conseguenza pratica**: siccome l'app userà lo stesso callsign del tracker,
il gate di riga 434 scatta anche per i messaggi che l'app vorrebbe gestire. F6
va rovesciata — l'app non ackka e riconosce passivamente l'ack del firmware,
oppure l'app opera sotto un SSID diverso e il gate non scatta mai.

**Nota di metodo sul dettaglio che sarebbe sfuggito**: `checkReceivedMessage`
rimuove il `{msgId}` dal payload a riga 444, ma solo dalla propria copia interna.
Verso il telefono parte `packet.text.substring(3)`, il frame grezzo. L'app vede
il msgId. Un riassunto di secondo grado avrebbe potuto invertire questo dettaglio,
e ci si sarebbe costruito sopra il parser sbagliato.

## Correlati

- Issue #1 — verifica del doppio retry, chiusa con questa lettura
- Issue #4 — F6 va rovesciata
- Issue #2 — RSSI/SNR non attraversano il BLE, PR upstream necessaria
- Issue #5, #6, #7, #8 — difetti firmware emersi dalla stessa lettura
- [docs/ideazione-2026-08-27.md](../../ideazione-2026-08-27.md) — sintesi completa
