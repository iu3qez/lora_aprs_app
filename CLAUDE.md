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
