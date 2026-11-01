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
| `20260804120000_baseline_lifeos_core.sql` | LifeOS core: `goals`, `pillar_status`, `happiness_reserve`, KPIs, `tasks`, … |
| `20260412*` – `20260803*` | Feature tables (meals, events, integrations, lists, …) |

**Additional LifeOS tables** on the hosted project (contacts, projects, expenses, …) are documented in `scripts/magnus_db_hardening.sql`. Enable context reads with `MAGNUS_LIFEOS_CONTEXT_ENABLED=true` when populated. Magnus tools `add_goal`, `update_pillar_status`, and `log_joy_tank` write to LifeOS tables.

## Hosted project

Health app project: **magnus-ai**, ref `uktsxijrewbqjcjnrfdv` (us-east-1). Railway `SUPABASE_URL` must point here.
The old Telegram-era project `xdrpjfdhduskhzryevze` (Tokyo) was empty and is paused (2026-11-01).

A fresh project needs the baseline, `20261027*`–`20261101090000` health migrations, and
`20261101150000_health_app_fresh_db_parity.sql` (meal, targets and integrations tables the app shares with the old bot).
Migrations use `IF NOT EXISTS`, so they are safe to apply without data loss.
