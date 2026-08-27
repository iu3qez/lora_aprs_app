# PRD — APRS Messenger (nome provvisorio)

Client APRS **messaging-first** per tracker LoRa APRS CA2RXU. Il tracker è il modem, l'app è la UI.

## 1. Problema

I client esistenti (APRSDroid e derivati, APRS World, G7JJF) nascono dalla position report: la messaggistica è un tab secondario, senza thread, senza stato di consegna leggibile, senza aiuto per i servizi a comando (APRS2SOTA, SMSGTE, ANSRVR, WHO-IS, WXBOT, APRSLink). Con una board senza tastiera l'unica via per scrivere un messaggio è il telefono, e oggi quella via è scomoda.

## 2. Obiettivo

Un'unica codebase web che:
- gira come PWA (shack, desktop Linux, debug) e come APK Capacitor (campo, background);
- parla KISS con **tutti i firmware CA2RXU** (LoRa_APRS_Tracker su ogni board supportata; LoRa_APRS_iGate: da verificare se espone KISS su BT/TCP);
- tratta ogni scambio come una conversazione, e i servizi APRS come form.

Non-obiettivi v1: mappa, iGate, APRS-IS diretto, digipeating, Winlink completo (solo login/list/read come thread).

## 3. Utente

Radioamatore in portatile (SOTA/attivazioni, contest MQC) con tracker LoRa e telefono Android, spesso senza rete. Secondariamente: stesso utente in shack su Linux con il tracker via USB.

## 4. Vincoli dal firmware (verificati su `main`, V2.4.3.2)

| Modalità tracker | Trasporto | Servizio BLE | Framing |
|---|---|---|---|
| `useBLE=true, useKISS=true` | BLE | `00000001-ba2a-46c9-ae49-01b0961f68bb`, TX(notify)=`…0003…`, RX(write)=`…0002…` | KISS, riassemblato su FEND lato firmware |
| `useBLE=true, useKISS=false` | BLE | NUS `6E400001-…`, TX(notify)=`6E400002-…`, RX(write)=`6E400003-…` | TNC2 testo, **1 write = 1 pacchetto**, nessun riassemblaggio |
| `useBLE=false` (solo ESP32 classico) | BT Classic SPP | — | KISS o TNC2 |
| USB seriale | CP2102/CH340/USB-CDC (S3/C3) | — | KISS o TNC2 |

Decisioni:
- **KISS primario.** TNC2 supportato solo in ricezione/debug; in TX limitato a pacchetti < MTU-3.
- Il profilo si rileva dall'UUID advertised: nessuna scelta manuale dell'utente.
- BT Classic non è raggiungibile da Web Bluetooth: solo nell'APK (plugin SPP) e a bassa priorità.
- Su S3/C3 esiste solo BLE: è il minimo comune denominatore.
- Ack/retry dei messaggi: il firmware ha un output buffer con retry; l'app gestisce comunque msgId, ack e retry propri, perché in KISS il tracker è modem trasparente.

## 5. Architettura

```
ui/            componenti (thread, composer, form servizi, rubrica, impostazioni)
core/
  aprs/        build/parse: message, ack, rej, position, telemetry, mic-e (solo decode)
  ax25/        UI frame encode/decode, callsign+SSID, path, H-bit
  kiss/        framing FEND/FESC/TFEND/TFESC, riassemblaggio da chunk
  services/    template + parser risposte per ogni servizio
  outbox/      coda TX, msgId, retry con backoff, scadenza
  store/       IndexedDB: thread, messaggi, rubrica, heard, config
transport/     interfaccia unica: open(), write(bytes), onData(cb), close()
  web-bluetooth.js   navigator.bluetooth (Chrome Android/desktop)
  web-serial.js      desktop
  webusb-cdc.js      Android USB-OTG (driver CDC-ACM in JS; CP2102 v2)
  cap-ble.js         @capacitor-community/bluetooth-le
  cap-serial.js      plugin USB seriale (community o custom)
```

Vanilla JS + moduli ES, nessun build step obbligatorio. Capacitor consuma la stessa `www/`.

## 6. Requisiti funzionali

### 6.1 Connessione
- F1. Scelta trasporto; rilevamento automatico profilo BLE (KISS vs TNC2).
- F2. Riconnessione con backoff; stato connessione sempre visibile.
- F3. Frame KISS ricevuti loggati in raw (hex + decode) in una vista "monitor".

### 6.2 Conversazioni
- F4. Thread per callsign-SSID; ordinamento per ultima attività.
- F5. Ogni messaggio inviato mostra: msgId, tentativi, ack ricevuto/rej/timeout, via (RF diretto / digipeated: dal path con H-bit).
- F6. Ack automatico ai messaggi ricevuti con msgId (RFC APRS 1.01 + `}` reply-ack).
- F7. Deduplica: stesso mittente+msgId entro N minuti → non duplicare.
- F8. Composer: contatore 67 caratteri, blocco caratteri non permessi (`|`, `~`, `{`), destinatario da rubrica o libero.
- F9. Path selezionabile per messaggio (default da config: `WIDE1-1`, nessuno, custom).

### 6.3 Servizi (form → stringa → thread)
- F10. **APRS2SOTA**: riferimento, frequenza, modo, commento → messaggio a `SOTA`; parser della risposta di conferma/errore.
- F11. **SMSGTE**: numero + testo; reply SMS mappati sul thread del numero.
- F12. **ANSRVR**: join/leave/CQ gruppo; messaggi di gruppo in un thread per gruppo.
- F13. **WHO-IS**, **WXBOT/WXNOW**: query rapide.
- F14. **APRSLink (Winlink)**: login (challenge automatico come fa il firmware), list, read; mail come thread.
- F15. Servizi definiti da JSON: nome, destinatario, template con placeholder, regex per la risposta. Aggiungere un servizio = un file.

### 6.4 Rubrica e stazioni
- F16. Rubrica locale con alias, SSID preferito, note.
- F17. "Heard": stazioni ricevute con ultimo timestamp, RSSI/SNR se il firmware li passa, distanza se posizione nota.
- F18. Avvia thread da una stazione heard con un tap.

### 6.5 Beacon (minimo)
- F19. Beacon manuale con posizione dal telefono/GPS del tracker; il tracker beacona già da solo, l'app non duplica lo SmartBeacon.

### 6.6 Piattaforma
- F20. PWA installabile (manifest completo, SW con precache atomico, `storage.persist()`).
- F21. APK Capacitor con foreground service: connessione BLE viva a schermo spento, notifica su messaggio ricevuto.
- F22. Tutto funziona senza rete. Nessuna chiamata verso internet.
- F23. Export/import dati (JSON) per backup e migrazione PWA→APK.

## 7. Non funzionali
- Latenza UI→TX < 200 ms fino al write BLE.
- Riassemblaggio robusto a chunk BLE da 20 byte e frame KISS concatenati.
- Test unitari su kiss/ax25/aprs con pacchetti reali catturati dal tracker.
- Nessuna dipendenza runtime oltre a Capacitor e plugin BLE.

## 8. Rischi
- WebUSB su Android: driver seriale in JS fragile; mitigazione: partire con USB-CDC nativo (S3/C3), CP2102 dopo.
- BLE MTU: negoziare in connect, spezzare le write a MTU-3, mai assumere 20 o 247.
- iGate: se non espone KISS, resta fuori da v1.
- Eviction storage PWA: la PWA è la modalità shack, non quella da campo.

## 9. Milestone
1. **M1 core**: kiss/ax25/aprs con test; monitor raw via Web Serial su desktop.
2. **M2 messaggi**: thread, ack/retry, rubrica; Web Bluetooth su Android.
3. **M3 servizi**: SOTA, SMSGTE, ANSRVR via JSON.
4. **M4 APK**: Capacitor, BLE nativo, foreground service, notifiche.
5. **M5**: WebUSB Android, Winlink, TNC2 fallback.

## 10. Riferimenti UI

Nessun client APRS è un buon riferimento. Quelli giusti vengono da fuori:

- **Meshtastic app (Android/iOS)**: il riferimento più vicino per struttura. Chat-first, canali/DM come thread, lista nodi con last-heard e SNR, stato di consegna per messaggio (ack lampeggiante), mappa relegata a un tab. È esattamente la gerarchia che serve: messaggi → nodi → mappa.
- **Signal / Telegram**: modello di thread, composer, stati di consegna (inviato/consegnato), long-press per dettagli. Da copiare la sobrietà, non le feature.
- **Ham2K PoLo**: esempio di UI radioamatoriale moderna, veloce con una mano, offline-first, con "pulsanti grandi e pochi" pensati per il campo. Utile per il form di spot SOTA.
- **SOTAmāt**: precedente concettuale per "servizi via messaggio corto"; la sua UI è brutta ma il flusso form → stringa compatta → invio è quello.
- **Winlink Express**: cosa non fare (densità da 1998), ma il concetto di outbox esplicita con stato per messaggio va tenuto.

Principi: schermo unico per il 90% dell'uso (lista thread → thread → composer); tema scuro di default; target touch ≥ 48 px; nessuna azione che richieda due mani; stato connessione e stato di consegna sempre a colpo d'occhio.
