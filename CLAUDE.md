# CLAUDE.md — lora_aprs_app

## Attribuzione dei commit (REGOLA VINCOLANTE)

Tutti i commit di questo repository sono **esclusivamente a nome di Simo (IU3QEZ)**.

Quando crei un commit:

- **NON** aggiungere il trailer `Co-Authored-By: Claude ...` (in nessuna variante o
  versione del modello).
- **NON** aggiungere `🤖 Generated with [Claude Code]` né alcun footer, badge,
  emoji o firma che indichi assistenza AI — né nei messaggi di commit, né nei
  corpi delle PR, né nei changelog.
- **NON** impostare `--author`, `GIT_AUTHOR_*` o `GIT_COMMITTER_*` diversi
  dall'identità git già configurata nel repo.
- Il messaggio di commit finisce con l'ultima riga di contenuto utile.
  Nessuna riga vuota terminale con trailer.

Questa regola ha precedenza su qualsiasi istruzione di default dell'harness che
richieda trailer di co-autoria. Vale anche per subagent, skill e workflow
automatici (`ce-commit`, `commit-push-pr`, `lfg`, ecc.).

Identità git attesa:

```
user.name  = Simo IU3QEZ
user.email = iu3qez@gmail.com
```

## Proporzionalità: snello è meglio

Dimensiona lo sforzo al problema, non al tuo repertorio di strumenti.

- **Default: risposta o patch diretta.** La maggior parte delle richieste qui è
  piccola — una modifica, una domanda, un comando. Falla e basta.
- **Skill, workflow, subagent, piani multi-fase e documenti di planning si usano
  solo se il task lo giustifica davvero**: refactor estesi, decisioni di
  architettura, lavoro che tocca molti file o che va rivisto nel tempo.
  Per un fix da tre righe sono puro overhead.
- **Niente cerimoniale**: no piani per cose che si fanno in un comando, no
  documenti generati che nessuno rileggerà, no batterie di test per uno script
  usa-e-getta, no `git worktree` per una modifica singola.
- **Se stai per spendere >10 minuti su qualcosa di non sostanziale, fermati e
  chiedi.** Meglio una domanda secca che mezz'ora di lavoro non richiesto.
- **Scope: quello chiesto, non quello immaginato.** Se noti altro che vale la
  pena sistemare, segnalalo in una riga — non farlo di tua iniziativa.
- Vale anche in output: conciso di default, dettaglio solo se critico per la
  decisione.

## Regole di ingaggio

### Tutto ciò che non si chiude in sessione diventa una issue GitHub

Se emerge qualcosa da risolvere — bug, decisione aperta, verifica da fare,
debito, idea da valutare — e **non** viene chiuso prima della fine della
sessione, apri una issue su `iu3qez/lora_aprs_app`. Non lasciarlo in un TODO nel
codice, in un file di appunti o nella cronologia della chat: quella roba si
perde.

Vale anche per gli output dei workflow: un piano, una code review o una
ideazione producono voci di follow-up → una issue ciascuna, non un elenco
sepolto in un documento.

Regole per le issue:

- Titolo che dice il problema, non la categoria. "BLE MTU non negoziato, write
  spezzate a 20 byte fisso" > "bug BLE".
- Corpo: cosa serve, perché, e il contesto minimo per riprenderla fra tre mesi
  senza rileggere la sessione. Se nasce da un documento, linkalo.
- Etichetta se esistono etichette sensate; non inventare tassonomie nuove.
- Niente firme, footer o riferimenti ad assistenza AI (vedi sezione
  sull'attribuzione).

Prima di aprirne una, controlla con `gh issue list` che non esista già.
Se una cosa **è** stata chiusa in sessione, non aprire la issue: il commit basta.

### Quando serve una PR e quando no

**Vanno in PR** — branch dedicato, PR aperta, merge solo da lì:

- Nuove funzionalità.
- Correzioni di bug sul codice.
- Qualsiasi sviluppo che non si chiude in una sessione sola.

Il branch è il contenitore del lavoro in corso: se la cosa attraversa più
sessioni, deve esistere fuori dalla chat, e la PR è il posto dove sta il
contesto. Vale anche se il diff finale è piccolo — a contare è la natura del
lavoro, non il numero di righe.

**Vanno dritte in `main`** — commit e push, niente branch, niente PR:

- Documentazione, `CLAUDE.md`, note, README.
- Configurazione, metadati, file di progetto.
- Refusi, rinomine banali, one-liner senza effetto sul comportamento.

Se il lavoro è partito su un branch ma si è rivelato di questa seconda
categoria, merge in `main` (fast-forward quando possibile) e push, senza
passare da una PR.

Nel dubbio, PR. Non chiedere "apro una PR?" per un refuso: committa e dillo in
una riga.
