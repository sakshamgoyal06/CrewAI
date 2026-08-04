# Supabase migrations

Migrations apply in filename order. **Additive only** on the hosted project — never run `db reset` against production.

## Fresh local database

```bash
# With Supabase CLI + local stack:
supabase db reset

# Or apply in order via direct Postgres:
npm run db:apply -- supabase/migrations/<file>.sql
```

## Baseline vs LifeOS

| Migration prefix | Contents |
|------------------|----------|
| `20260401*` | Core tables: `user_profile`, `magnus_chat_messages` |
| `20260412*` – `20260803*` | Feature tables (meals, events, integrations, lists, …) |

**LifeOS domain tables** (`goals`, `tasks`, `pillar_status`, `happiness_reserve`, `patterns`, …) predate this repo's migration history. Reference DDL and hardening live in `scripts/magnus_db_hardening.sql` (applied on the hosted project). Enable reads with `MAGNUS_LIFEOS_CONTEXT_ENABLED=true` when those tables are populated.

## Hosted project

Project id: `xdrpjfdhduskhzryevze` (see `magnus.md`). Baseline migrations use `IF NOT EXISTS` — safe to apply without data loss.
