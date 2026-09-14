# Magnus — project tracker

**Last updated:** 2026-09-14  
**Status:** **v1 retired** — production runs **maintenance shell** only. **v2 clean-room** per 21-day plan.

| Doc | Purpose |
|-----|---------|
| **`docs/product/MAGNUS_V2_21_DAY_BUILD_PLAN.md`** | **Authoritative v2 build** — Day 1–21, stack, non-goals |
| **`docs/archive/LEGACY_V1_DEEP_DIVE.md`** | Frozen inventory of v1 — architecture, DB, integrations, lessons |
| **`archive/legacy-v1/`** | v1 source, migrations, docs (not deployed from root) |
| **`archive/legacy-v1/magnus.md`** | Historical v1 operational tracker |

---

## What Magnus is (v2 target)

An **adaptive personal intelligence system** in Telegram that maintains:

**Intent → Strategy → Action → Reality → Observation → Diagnosis → Adaptation**

Magnus answers four questions: what do I want; where do I stand; what should I do next; should anything change.

Not a task manager, habit tracker, or multi-agent LifeOS clone. See the build plan for product contract and non-goals.

---

## What runs in production today

| Item | Detail |
|------|--------|
| **Runtime** | Node.js ≥ 20 (temporary maintenance shell until Day 1 Python scaffold lands) |
| **Entry** | `src/index.ts` |
| **HTTP** | `GET /health`, `GET /ready` → maintenance JSON |
| **Telegram** | Optional: offline message only if `TELEGRAM_BOT_TOKEN` set |
| **v1 stack** | **Off** — no Anthropic, Supabase, or Redis required at root |

---

## Quick start (maintenance)

```bash
npm install
cp .env.example .env
npm run dev
npm test
npm run build && npm start
```

---

## v2 stack (planned — Day 1+)

Python 3.12+, FastAPI, PostgreSQL, SQLAlchemy 2, Alembic, Pydantic, python-telegram-bot or aiogram, pytest. Suggested tree in build plan § Engineering.

Repository may stay named `magnus` or fork to `magnus-core` per plan; **no legacy `src/` imports**.

---

## Database

v1 Supabase project and data remain as-is (archived). v2 should use a **new schema** (migrations via Alembic). Do not point v2 at v1 tables without an explicit migration design.

---

## Not built yet (v2)

Everything in the 21-day plan starting at **Day 1 — product contract + clean repository**.

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Maintenance HTTP + optional Telegram |
| `npm run build` / `npm start` | Compile and run |
| `npm test` | Vitest — maintenance status |

Legacy v1 scripts live under `archive/legacy-v1/scripts/`.
