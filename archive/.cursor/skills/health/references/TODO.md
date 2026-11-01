# Health pillar — deferred TODO

Tracked by the Health Cursor agent. Pick up when the user asks or during hardening passes.

## Later

- [ ] **Telegram bot live test** — Cloud workspace `.env` only has `HEVY_API_KEY`; fill `TELEGRAM_BOT_TOKEN`, `SUPABASE_*`, `ANTHROPIC_API_KEY`, `UPSTASH_REDIS_*` locally or on deploy host, then `npm run dev`. Only one long-poller per bot token.
- [ ] **Supabase journal table** — optional `health_journal_entries` for Telegram EOD flow (Cursor markdown journal is v1).
- [ ] **Morning Brief health slice** — surface last journal “focus for tomorrow” in brief (cross-cutting).

## In progress / next

- [x] **Telegram health memory** — `loadHealthReferences.ts` + `/journal` → `magnus_daily_logs` (2026-07-16).
- [ ] **Routine tuning from journals** — use `program-learnings.md` + last 7 journal entries before any Hevy routine edit.
- [ ] **Diet section in user-context** — capture when user shares eating style.
