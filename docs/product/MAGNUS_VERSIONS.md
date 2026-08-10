# Magnus — Version history

**Current release:** **Magnus v1.0** (2026-08-10)

Magnus uses **major versions** for product-line shifts: new architecture, new constructs, or breaking behavioural promises. Minor fixes and incremental pillar depth ship inside the current major unless they explicitly change the product contract.

---

## Magnus v1.0 — Chief of staff with activity taxonomy

**Shipped:** 2026-08-10 (PR #77)  
**Tagline:** From single-lane tools to a **life operating model** Magnus co-executes with you.

### What changed vs v0

| Area | Magnus v0 | Magnus v1 |
|------|-----------|-----------|
| **Product model** | Four pillars + Magnus tools lane | **Operations · Goals · Projects** activity layer on top of pillars |
| **Tool access** | Only Magnus (`GENERAL`) had tools | **All pillar agents** may use shared **operations tools** |
| **Trust / voice** | Action integrity on Magnus path only | **Accountability Agent** — terminal vet, `action_ledger`, one Magnus voice for all agents |
| **Projects** | Dormant schema; Wisdom prompt-only “shipping” | First-class **projects** with setup FSM, themes, checklist, milestones, conflict detection |
| **Goals** | LifeOS schema; rare writes | **`goal_manage`** capability wired to conversation |
| **Proactive** | Catalog kinds (meals, journal, …) | + **`project_conflict_review`** for competing projects |
| **Docs** | Runtime tracker | + `ACTIVITY_TAXONOMY.md`, `PROJECT_DEFINITION.md`, version canon |

### v1 architecture (high level)

```
User → Orchestrator → Pillar plan → Executors (+ ops tools)
                              ↓
                    Accountability Agent → one reply + action_ledger
```

Projects inject context via memory + routing hints; they are **not** a sixth pillar.

### Migration required for v1 project features

```bash
npm run db:apply -- supabase/migrations/20260810160000_projects_and_sessions.sql
```

### What stays the same

- Telegram-only interface; `/start` and `/help` only
- One Magnus voice; invisible pillar routing
- Four pillars unchanged
- Health depth (Hevy, meals, meal planning journey)

---

## Magnus v0 — Foundation release

**Final v0 merge:** PR #76 (2026-08-10)  
**Scope:** Production-ready Telegram chief-of-staff **foundation**.

Shipped in v0:

- Five-way intent routing (GENERAL + four pillars)
- Magnus tools: calendar, event log, lists, YouTube, Notion, proactive
- Health composite: meal logging, Hevy, meal planning journey, onboarding
- Pillar strategy pipeline: parse → execute → compose
- Action integrity + finalize Magnus voice (Magnus path)
- Memory: user knowledge graph, semantic facts, rolling summary
- Proactive cron: morning brief, event reminders, nutrition nightly, subscription kinds
- Wealth: Zerodha read-only context
- Multi-user via `user_profile` allowlist

v0 explicitly **did not** ship: projects execution, cross-agent tools, activity taxonomy, full LifeOS writes.

---

## Versioning policy (v1 onward)

| Bump | When |
|------|------|
| **Major (v2, v3, …)** | New product construct, architecture revamp, or breaking user-facing contract |
| **Minor (v1.1, …)** | New themes, pillar depth, integrations — same activity model |
| **Patch** | Bugfixes, prompt tuning, migration fixes — no new product promises |

When starting a major version:

1. Add a section to this file before merge
2. Bump `package.json` major
3. Update `magnus.md` **Release** line
4. PR title: `Magnus vN: …`
