# Health EOD journal

One file per calendar day: `YYYY-MM-DD.md`.

## User habit

End of each day:

1. Invoke **`/eod-journal`** (or `/health` → “end of day review”).
2. Review what you did (training, food, sleep, energy).
3. Journal how you feel and what worked / didn’t.
4. Agent saves the entry and updates **`program-learnings.md`** + **`user-context.md`** when facts are durable.

## Agent habit

After each journal:

- Append or update `journal/YYYY-MM-DD.md` from `TEMPLATE.md`.
- Distill bullets into `program-learnings.md` (Working / Not working / Open tweaks / Routine change log).
- If routine changes are warranted → hand off to **`/hevy`** with preflight; never silent Hevy writes.

## Files

| File | Role |
| ---- | ---- |
| `TEMPLATE.md` | Copy structure for new days |
| `YYYY-MM-DD.md` | That day’s narrative + structured fields |
| `../program-learnings.md` | Cross-day distilled memory for agents |
| `../user-context.md` | Stable program facts (IDs, rules) |
