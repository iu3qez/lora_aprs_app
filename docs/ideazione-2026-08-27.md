# Ideazione — 27 agosto 2026

Cinque agenti su sei frame (pain, inversione, leva, analogia cross-domain,
rottura di assunzioni + inversione di vincoli). 39 idee grezze. Questo documento
tiene la sintesi; i follow-up vivono come issue, non qui.

Vincoli dati in ingresso: SQ2CPA come benchmark, PWA fuori, firmware patchabile.

## 1. Il risultato principale: il firmware non è un modem trasparente

La decisione 5 del PRD è falsa come scritta. Verificato sul sorgente di
`richonguzman/LoRa_APRS_Tracker`, il tracker fa di testa sua, senza sapere nulla
del telefono e senza flag per spegnerlo:

| Comportamento | Dove |
|---|---|
| Auto-ack dei messaggi al proprio callsign | `msg_utils.cpp:434,442-443` |
| Risposta `"pong, 73!"` a `ping` | `msg_utils.cpp:452` |
| Digipeat se `digipeaterActive` | `msg_utils.cpp:423-431` |
| Dedup a 15 secondi | `check15SegBuffer()` |
| Stato di ack pendente proprio | `msg_utils.cpp:437-441` |
| Retry a 6 tentativi, backoff 30/60/120 s | `msg_utils.cpp:321-343` |

Gira tutto **prima** del gate `if (bluetoothActive && bluetoothConnected)`
(`LoRa_APRS_Tracker.cpp:215-219`): a telefono spento il tracker continua.

**In TX invece la decisione 5 regge**: `ble_utils.cpp:172` manda il pacchetto
dell'host direttamente a `LoRa_Utils::sendNewPacket()`, saltando buffer e retry
del firmware. Ritrasmissione e msgId restano all'app, senza sovrapposizione.

Conseguenza immediata: **F6 va rovesciata** (issue #4). Due strade — l'app non
ackka e riconosce passivamente l'ack del firmware, oppure l'app usa un SSID
diverso da `currentBeacon->callsign` e il gate del firmware non scatta mai,
restituendo all'app il controllo completo del protocollo senza toccare il
firmware.

## 2. Il canale che non esiste ancora: KISS command byte

Tre agenti su cinque, indipendentemente, hanno trovato la stessa apertura.

`kiss_utils.cpp:74` — `encapsulateKISS(const String& ax25Frame, uint8_t command)`
scrive un command byte (`0x0f & command`, riga 77), ma l'unica chiamata esistente
è `encapsulateKISS(ax25Frame, KissCmd::Data)` (riga 169). In decodifica,
`kiss_utils.cpp:117` testa solo `KissCmd::Data` e tutto il resto cade in un
passthrough inutilizzato.

C'è quindi un canale laterale già framato, oggi vuoto. Il codepoint sanzionato
dalla spec KISS per dati specifici del TNC è `SetHardware` (0x06). Un client che
non lo conosce lo ignora: la PR upstream è **additiva e non rompe nessuno**.

Cosa ci passa dentro, in ordine di valore:

1. **RSSI / SNR / freqError** — misurati a `lora_utils.cpp:234-236,260-261`,
   consumati on-device a `msg_utils.cpp:414`, e buttati via: verso il telefono
   parte solo `packet.text.substring(3)`. Sblocca F17. `freqError` non lo espone
   nessun client APRS al mondo.
2. **Capability handshake** — il firmware dichiara nome, versione e bitmap di
   funzioni. L'app degrada su build stock e si accende su build patchate, quindi
   spedisce *prima* che le PR siano merged. È anche il tripwire contro il drift
   upstream.
3. **Parametri LoRa live** (SF/BW/CR/freq/power) — senza questi l'airtime non è
   calcolabile lato app.
4. **Config in campo** — oggi la configurazione passa solo da `web_utils.cpp`,
   un server WiFi inutilizzabile in attivazione.

## 3. Quattro difetti del firmware, verificati, tutti upstream-abili

Il canale con Ricardo (CA2RXU) è aperto, quindi valgono come PR, non come
lamentele.

**a) Il TX dell'host non torna indietro.** `station_utils.cpp:256` echoa i
pacchetti trasmessi dal tracker verso il telefono
(`BLE_Utils::sendToPhone(packet); // send Tx packets to Phone too`), ma
`ble_utils.cpp:168-175` non fa lo stesso dopo `sendNewPacket()`. Una riga di C++
darebbe all'app la prova fisica che il pacchetto è andato in aria — lo stato che
secondo la review di Briar tutti i client dichiarano senza averlo.

**b) Nessun listen-before-talk sul path BLE.** Il firmware protegge i propri
messaggi con `(millis() - lastMsgRxTime) >= 4500 && (millis() - lastTxTime) > 3000`
(`msg_utils.cpp:336`). Il path BLE non ha niente: `onWrite` alza un flag e il
giro di loop successivo chiama `sendNewPacket()`. L'app può quindi keyare mentre
la controparte sta ancora trasmettendo — è esattamente `ge0rg/aprsdroid#270`.

**c) Il path TNC2 costa una notify BLE per byte.** `ble_utils.cpp:201` —
`for (int n = 0; n < frame.length(); n++) txBLE(frame[n]);` e `txBLE` fa
`setValue(1 byte) + notify() + delay(3)`. Un frame da 100 caratteri sono 100
notifiche e 300 ms di main loop bloccato. Il path KISS usa chunk ma con
`delay(200)` ciascuno.

**d) Il telefono riceve duplicati che il tracker sopprime.**
`LoRa_APRS_Tracker.cpp:219` inoltra ogni pacchetto senza passare da
`check15SegBuffer()`.

## 4. Dove SQ2CPA è avanti, e dove non arriva

Damian SQ2CPA (Polonia) — nessun canale, codice chiuso. `LoRa_APRS_Mobile_App`
contiene solo un README e release binarie.

Già spedito e fatto bene: thread stile messenger, stato di consegna con
attribuzione RF vs gateway TCPIP, heard list con auto-cleanup, raw frames view,
contatore caratteri, validazione callsign, background con auto-connect,
**lista di tracker con failover automatico** (il PRD ha solo F2, riconnessione
a dispositivo singolo), sette lingue, CQ e bollettini come tipi di messaggio
di prima classe, telemetria con grafici, meteo per stazione, mappa di rete.
Niente beacon di posizione, per scelta dichiarata.

**Il buco è l'intero layer dei command service.** Né il README dell'app né
`aprs-tnc-web` nominano APRS2SOTA, SMSGTE, ANSRVR, WHO-IS, WXBOT o APRSLink.
F10-F15 è terreno libero, ed è l'unica area dove un layer JSON dichiarativo in
una codebase web editabile batte un APK compilato nel merito.

Il suo progetto aperto `SQ2CPA/aprs-tnc-web` (MIT, Next.js) vale come specifica
gratuita: la decomposizione dei parser (`lib/aprs/parsers/` — Beacon, Message,
Status, Telemetry, Weather, FromIS) è una buona forma, e la superficie API dice
quali operazioni servono davvero a un client APRS funzionante — fra cui
`messages/cancel` e `messages/retry`, che il PRD non prevede.

## 5. Idee sopravvissute, in ordine di convinzione

Ognuna è una issue. Il numero fra parentesi è il frame che l'ha prodotta.

1. **F6 rovesciata** — issue #4 (pain, inversione, assunzioni: convergenza a tre)
2. **Sideband KISS 0x06** — issue #2 esteso (leva, cross-domain, assunzioni)
3. **Consegna come macchina a cinque stati**, ognuno con evidenza fisica
   distinta: in coda → scritto su BLE → trasmesso (echo) → sentito digipetato →
   ackato. Il quarto stato non è consegna: è la biforcazione che Meshtastic
   distingue e che tutti i client APRS collassano.
4. **Custody transfer dal DTN**: sentire il proprio pacchetto tornare da un digi
   sopprime la fase aggressiva del retry, perché la copia del digi sta già
   propagando meglio della tua. E il negativo — nessun hearback entro una
   finestra — significa che la trasmissione non è mai entrata in rete, che è
   un'azione operatore completamente diversa.
5. **Ack ritardato e jitterato** per callsign-pair: a SF12/BW125 un frame da 60
   byte è ~2,6 s di aria, quindi un ack immediato atterra dentro la trasmissione
   del mittente e si perde.
6. **Airtime al posto del contatore caratteri**: a SF12 la differenza fra 20 e 67
   caratteri sono secondi di canale condiviso, non byte.
7. **Thread con chiave a identità di conversazione**, non callsign: un servizio
   risponde da un'identità diversa da quella a cui hai scritto, e ANSRVR frantuma
   un gruppo in N thread.
8. **Store content-addressed**: `getAckRequestNumber()` (`msg_utils.cpp:274-280`)
   incrementa fino a 999 e riparte, quindi il msgId non è né stabile né
   abbastanza largo per essere un'identità. Con chiave a contenuto, import,
   dedup e merge fra dispositivi diventano union idempotenti.
9. **Path inferito dal traffico passivo**: ogni frame decodificato porta la lista
   digipeater con i bit H. Dopo quattro minuti di ascolto la radio sa quale digi
   copre questo cocuzzolo; F9 oggi è un dropdown statico.
10. **Attivazione come contesto di prima classe**: lo spot APRS2SOTA è la causa,
    il traffico dei chaser nei minuti seguenti è l'effetto. Oggi sono requisiti
    scollegati.
11. **Il tracker come mailbox**: il firmware persiste i messaggi su SPIFFS e li
    ricarica al boot, ma l'app non ha modo di chiederglieli. Replay al connect
    ripara il punto più debole del PRD (la eviction, mitigata solo da F23).
12. **Riga macro derivata dallo stato**, non configurata: dopo uno spot diventa
    vocabolario da chase precompilato con la frequenza appena spottata.

## 6. Da correggere nel PRD a prescindere

- **F8**: contare i byte UTF-8, non `String.length` (code unit UTF-16). Il limite
  APRS è 67 **byte**; con accenti italiani un contatore ingenuo mostra verde su
  un messaggio che si tronca a metà carattere.
- **F7**: dimensionare la finestra sapendo che il firmware già dedupa a 15 s.
- **msgId a lunghezza variabile**: il firmware genera fino a tre cifre, il
  reply-ack `{MM}` della spec ne ha due.
- **F4/F16/F17**: nessuna politica di retention. Dopo la quinta attivazione la
  lista utile è sepolta.
- **Latenza**: il target «< 200 ms fino alla write BLE» misura l'intervallo che
  l'utente non percepisce. Quello che percepisce è la scala di retry, minuti.
