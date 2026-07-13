---
name: hevy
description: Hevy API integration for Magnus — create/update routines, log workouts, list templates, operational scripts. Use for /hevy, hevy routine:, hevy workout:, and scripts/health/workouts/hevy/.
disable-model-invocation: true
paths: "src/pillars/health/workouts/hevy/**,src/pillars/health/workouts/agents/hevyWriteAgent.ts,scripts/health/workouts/hevy/**"
---

# Hevy specialist

## Load first

1. `.cursor/skills/health/references/user-context.md` — folder id, routine IDs, program rules
2. `.cursor/skills/health/references/program-learnings.md` — what's working / not (from EOD journals)
3. **Recent journals** — `references/journal/` last 1–3 days before any routine edit
4. `src/pillars/health/workouts/hevy/hevyClient.ts` — GET/POST/PUT
3. `src/pillars/health/workouts/agents/hevyWriteAgent.ts` — LLM → JSON → API
4. `scripts/health/workouts/hevy/` — operational scripts

## Env

- `HEVY_API_KEY` (required for live calls)
- Optional: `MAGNUS_HEVY_API_BASE_URL`, `MAGNUS_HEVY_FETCH_TIMEOUT_MS`

## Write workflow (scripts)

1. **Preflight** script → exercise mapping table + payload
2. **Wait for user confirmation**
3. **Create/update** one routine per confirmed turn (unless user asks for batch)
4. Verify **Hevy Coach folder** `3206984` before creates

## API rules (learned)

- **Create routine:** send `folder_id: null` explicitly if at root
- **PUT routine:** strip `index` from sets; omit `folder_id`
- **PUT workout:** `is_private: false`; no `routine_id`; empty strings → `null`; strip `index` from sets

## Commands (Telegram / chat)

- `hevy routine: …` — create
- `hevy routine update: <uuid> — …` — replace
- `hevy workout: …` — log completed session

## Scripts

```bash
npx tsx scripts/health/workouts/hevy/hevy-list-templates.mts
npx tsx scripts/health/workouts/hevy/hevy-search.mts "bench"
```

After successful creates, update **`user-context.md`** with new routine IDs and add a row to **`program-learnings.md`** Routine change log.

After journal-driven edits, note the reason in today's **`journal/YYYY-MM-DD.md`**.
