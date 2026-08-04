# Magnus — Vision Document

**Version:** 1.1  
**Last updated:** 2026-08-04  
**Status:** Active — aligns `MAGNUS_CORE_CONTEXT.md` with current codebase  
**Audience:** Product owner, contributors, future self

---

## 1. One sentence

**Magnus is your AI chief of staff** — one conversational surface that runs your personal LifeOS: the same rules, rituals, and pillars you live by, executed from the digital side without you managing departments.

---

## 2. The problem

Modern life operating systems fragment across apps: calendar here, workouts there, notes in Notion, finances in a broker, learning in bookmarks. You hold the integration burden. Generic AI assistants answer questions but do not **remember commitments**, **respect pillar boundaries**, or **act** on your behalf with guardrails.

Magnus exists to be the **execution and reasoning layer** on top of a deliberate personal philosophy — not another chatbot.

---

## 3. What success looks like (3-year horizon)

| Signal | Target state |
|--------|--------------|
| **Daily use** | Morning brief read, commitments logged, meals/workouts captured in natural language |
| **Trust** | Magnus never invents calendar changes; reschedules preserve history; secrets stay in your control |
| **Pillar balance** | System surfaces when one pillar drops — without cross-pillar excuse logic |
| **Depth where earned** | Health is deep (Hevy, meals, program memory); other pillars grow tools as patterns emerge |
| **One voice** | User never thinks about routing — Magnus is Magnus |
| **Human + machine** | Notion remains readable; Supabase is machine truth; Telegram is the fast path |

---

## 4. Core beliefs (inviolable)

These come from LifeOS philosophy and must not be optimized away:

1. **One focus per pillar** — finish or deliberately replace before stacking.
2. **No cross-pillar dependencies** — a bad health week does not collapse wealth scoring logic.
3. **Joy is protected, not optimised** — tank model, not a score to maximise.
4. **Morning brief is a read, not a task** — short synthesis, not new obligations.
5. **Locked day** — plan once; avoid re-deciding all day.
6. **Emergency protocol (MVD)** — minimum viable dose with tracked debt when overwhelmed.
7. **Balance penalty** — if any pillar falls below threshold, the whole system flags.

---

## 5. Product model

### Personal company metaphor

| Role | Who |
|------|-----|
| CEO | You — direction, north star, final decisions |
| Chief of staff | **Magnus** — routing, synthesis, tools, proactive nudges |
| Departments | Health, Wealth, Happiness (Joy), Wisdom specialists |

You message one surface. Magnus decides which specialist logic applies — **invisibly**.

### Meta-KPI: happiness reserve

Subjective wellbeing sits above departmental KPIs. If everything looks green but happiness reserve drops, the system treats that as the primary signal — goals may need to change, not just effort increased.

---

## 6. What Magnus is NOT

- Not a generic ChatGPT wrapper with a system prompt
- Not a task manager you must maintain separately from conversation
- Not multi-voice ("Health bot says…", "Wealth bot says…")
- Not a trading bot (Kite is read-only; orders require explicit future CONFIRM flow)
- Not a replacement for Notion as human-readable documentation

---

## 7. Current state vs vision (honest)

| Vision element | Today (Aug 2026) |
|----------------|------------------|
| Single orchestrator voice | **Shipped** |
| Telegram interface | **Shipped** |
| Four pillar routing | **Shipped** (Health deep; others shallow) |
| Event log + calendar sync | **Shipped** |
| Meal logging + macros | **Shipped** |
| Hevy integration | **Shipped** |
| Notion journal + lists | **Partial** — Supabase canonical, Notion mirror |
| Morning brief (proactive) | **Shipped** — cron + manual trigger |
| LifeOS KPI tables (goals, patterns, joy tank) | **Schema exists; app mostly reads, rarely writes** |
| Vector / semantic memory | **Not built** — rolling summary + facts only |
| Deviation detection (L1–L3) | **Not built** |
| Operating modes (rough patch, intervention) | **Not built** |
| Web dashboard | **Not built** |
| WhatsApp | **Not in scope for this repo** |

---

## 8. Strategic priorities (next 12 months)

1. **Schema truth** — reproducible migrations; stop reading empty LifeOS tables or wire writers.
2. **Security defaults** — production allowlist discipline; fail-closed rate limits.
3. **Happiness depth** — list recommendation, taste memory, joy tank writes.
4. **Wealth read path** — budget/goals from conversation → `goals` table.
5. **Wisdom depth** — learning goals, project shipping tied to `projects`/`features`.
6. **Calendar in brief** — Morning Brief includes today's calendar when connected.
7. **Semantic recall** — pgvector on journal + facts (when volume justifies cost).

---

## 9. Naming canon

| Term | Meaning |
|------|---------|
| **LifeOS** | Philosophy + rituals + pillar rules (human + Notion) |
| **Magnus** | This software — the bot and orchestrator |
| **Joy / Happiness** | Same pillar — `HAPPINESS` in code, `joy` in DB events |
| **Magnus (pillar)** | Cross-cutting work — calendar, logging, reminders (`GENERAL` intent) |

---

## 10. Related documents

| Doc | Purpose |
|-----|---------|
| `docs/product/BRD.md` | Business requirements |
| `docs/product/PRD.md` | Product requirements |
| `docs/product/TRD.md` | Technical requirements |
| `docs/product/ARD.md` | Architecture requirements |
| `magnus.md` | Operational source of truth |
| `docs/review/IMPARTIAL_REVIEW_2026-08-04.md` | Technical audit + cleanup plan |
| `MAGNUS_CORE_CONTEXT.md` | Historical philosophy doc (partially stale — prefer this file) |
