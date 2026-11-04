# Supabase migrations

Migrations apply in filename order. **Additive only** on the hosted project: never run `db reset` against production. They use `IF NOT EXISTS`, so re-applying one is safe.

## Hosted project

The health app runs on **magnus-ai** (ref `uktsxijrewbqjcjnrfdv`, us-east-1). Railway's `SUPABASE_URL` points here.
New migrations are applied by hand in the [SQL editor](https://supabase.com/dashboard/project/uktsxijrewbqjcjnrfdv/sql/new) or with
`SUPABASE_DB_PASSWORD=… npm run db:apply -- supabase/migrations/<file>.sql`. The project's own migration history was recorded
under different version numbers, so compare by name, not by version.

## What's here

| Prefix | Contents |
|---|---|
| `20260401*` – `20260906*` | Baseline from the Telegram era: `user_profile`, chat, meals, integrations, LifeOS tables. Only `user_profile`, `user_integrations` and the meal tables are still used. |
| `20261027*` onward | The health app: activity, goals, check-ins, routine, chat turns, push, RCA, interventions, tokens, food database. |

Every user table has row level security on with no policies (deny by default); the server uses the service role and scopes every query by user id.

## Fresh local database

```bash
supabase db reset          # Supabase CLI + local stack
```
