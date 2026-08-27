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
