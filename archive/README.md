# Magnus archive

**Production must not import, mount, or execute anything under `archive/`.**

This tree preserves Magnus **v1** (Node.js / TypeScript / Supabase) after the **2026-09-14 clean-room reset**. Active development follows [`docs/product/MAGNUS_V2_21_DAY_BUILD_PLAN.md`](../docs/product/MAGNUS_V2_21_DAY_BUILD_PLAN.md).

| Path | Contents |
|------|----------|
| [`legacy-v1/`](./legacy-v1/) | Full v1 application: `src/`, `scripts/`, `supabase/migrations/`, `docs/`, `magnus.md` tracker snapshot |
| [`../docs/archive/LEGACY_V1_DEEP_DIVE.md`](../docs/archive/LEGACY_V1_DEEP_DIVE.md) | Human-readable inventory, architecture, lessons — **read this before opening legacy code** |

To run v1 locally for archaeology only:

```bash
cd archive/legacy-v1
npm install   # uses repo-root package-lock until split; see legacy-v1/README.md
```

The repo root ships a **maintenance shell** only (`src/` at root).
