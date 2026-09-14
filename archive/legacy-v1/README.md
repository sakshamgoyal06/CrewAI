# Magnus v1 (archived application)

Frozen snapshot of the pre–v2 Telegram chief-of-staff stack. **Not deployed** from this path after 2026-09-14.

## Layout

| Path | Role |
|------|------|
| `src/` | Bot, orchestrator, agents, integrations |
| `scripts/` | Provisioning, migrations, dev tooling |
| `supabase/migrations/` | Postgres schema history |
| `docs/` | v1 product, architecture, review plans |
| `magnus.md` | v1 operational tracker (historical) |
| `.env.example` | v1 environment template |

## Run locally (archaeology)

From **repository root** (maintenance-era `package.json` is minimal — use a checkout tag before the archive commit, or temporarily point tooling at this tree):

1. Copy `archive/legacy-v1/.env.example` → `archive/legacy-v1/.env` and fill credentials.
2. Use Node ≥ 20, `npm ci` at repo root from a **pre-archive** commit, or maintain a separate lockfile here if you need frequent v1 runs.

Prefer reading [`../../docs/archive/LEGACY_V1_DEEP_DIVE.md`](../../docs/archive/LEGACY_V1_DEEP_DIVE.md) over spelunking `src/` cold.

## Do not

- Wire Railway/Docker to build from this directory.
- Merge v1 domain models into v2 without explicit design review.
- Copy-paste orchestrator/agent code into the clean-room Python core (per v2 plan).
