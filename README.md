# Magnus

**Magnus v1 is retired (2026-09-14).** This repository is in **maintenance mode** while **Magnus v2** is built clean-room per the 21-day plan.

| What | Where |
|------|--------|
| **v2 build plan** | [`docs/product/MAGNUS_V2_21_DAY_BUILD_PLAN.md`](docs/product/MAGNUS_V2_21_DAY_BUILD_PLAN.md) |
| **Live tracker** | [`magnus.md`](magnus.md) |
| **v1 deep-dive archive** | [`docs/archive/LEGACY_V1_DEEP_DIVE.md`](docs/archive/LEGACY_V1_DEEP_DIVE.md) |
| **v1 code (frozen)** | [`archive/legacy-v1/`](archive/legacy-v1/) — **not** used by production Dockerfile |

## Maintenance shell

```bash
npm install
cp .env.example .env   # optional TELEGRAM_BOT_TOKEN
npm run dev
```

- `GET /health` and `GET /ready` return `{ "status": "maintenance", "magnus": "v1_retired", ... }`.
- If `TELEGRAM_BOT_TOKEN` is set, `/start`, `/help`, and all messages get a short offline notice (no LLM, no Supabase).

## v2 direction (summary)

Python 3.12+, FastAPI, PostgreSQL, Alembic, Telegram adapter, explicit domain model (life objects, strategy versioning, event ledger, diagnosis). See the build plan for day-by-day scope.

**Do not** import from `archive/legacy-v1/` in new v2 application code.
