# Magnus — core philosophy & structure

**Purpose:** Stable local context for *why* this project exists and *how* it is meant to work — across LifeOS (your operating system), Magnus (the orchestrator product), and this repository. For day-to-day implementation details, env vars, and DB specifics, use **`magnus.md`** at the repo root. For **agent personas, prompts, scope, and bot actions**, see **`docs/AGENT_ROSTER.md`**.

**Last updated:** 2026-04-12

---

## 1. Naming (do not conflate these)

| Name | Meaning |
|------|--------|
| **LifeOS** | The *philosophy and architecture* of your personal life operating system: pillars, rules, rituals (morning brief, check-ins, reviews), Notion as human-readable surface. |
| **Magnus** | The *software* chief of staff: the bot/orchestrator that runs LifeOS from the digital side. User-facing strings and the Telegram bot are **Magnus**. |
| **This repo (`Magnus/`)** | The Node.js service that hosts the Magnus orchestrator (today: Telegram + Claude + Supabase + Redis). It is the implementation spine for the broader vision. |

Some early planning docs used **“JARVIS”** as a label for the orchestrator layer; treat that as the same *role* as **Magnus** in current naming.

---

## 2. LifeOS philosophy (inviolable)

These rules are meant to hold across Notion, agents, and code. They should not be “optimised away” by features.

1. **One focus per pillar** — No stacking; finish or deliberately replace before starting the next.
2. **No cross-pillar dependencies** — A bad week in one pillar does not excuse or collapse another’s scoring logic.
3. **Joy is protected, not optimised** — Joy uses a **tank** model (watch when it is low), not a score to maximise.
4. **Annual Misogi** — One big yearly challenge (~50% failure probability); not scored; not punished if it fails.
5. **Balance penalty** — If any pillar falls below an agreed threshold (e.g. “4”), the **whole system** flags; no new commitments until addressed.
6. **Locked day** — Plan once in the morning; avoid re-deciding all day.
7. **Emergency protocol (MVD)** — Minimum Viable Dose mode with a time cap and **tracked debt** when overwhelmed.
8. **Morning brief is a read, not a task** — Short, generated, not a new pile of obligations.

**Four pillars (conceptual):** Health, Wealth, Wisdom, Joy — each with one active “one thing” and a coherent score model (Joy as tank; others as progress toward goals).

---

## 3. Magnus vision — what the product *is*

Magnus is the **LifeOS orchestrator**: not a separate philosophy, but the **execution and reasoning layer** on top of the same rules.

### 3.1 Meta-KPI: happiness / “worth living”

**Happiness** (or a **happiness reserve**) is the **meta-metric** above departmental KPIs. If everything looks green but subjective wellbeing drops, the system should treat that as the most important signal — goals may need to change, not just effort increased.

### 3.2 Personal company model

- **You** = CEO (direction).
- **Magnus** = chief of staff (routing, synthesis, escalation).
- **Specialist agents** = departments (health, wealth, patterns, memory, etc.).

You message one surface; Magnus decides which specialist logic applies.

---

## 4. Five-layer architecture (target)

| Layer | Role | Typical tech (plan) |
|-------|------|---------------------|
| **5 — Interface** | How you talk to Magnus | Messaging (e.g. WhatsApp/Twilio in some docs), **Telegram in this repo**, future web dashboard |
| **4 — Orchestrator** | Routes, delegates, coordinates | Node.js (this service) |
| **3 — Agent layer** | Specialists do domain work | Claude / structured agents |
| **2 — Tools** | External APIs per domain | Calendar, Notion, brokers, GitHub, etc. |
| **1 — Memory** | Shared durable + fast state | PostgreSQL (Supabase) + **pgvector**, Redis (Upstash) |

---

## 5. How agents coordinate (three patterns)

1. **Shared memory (passive)** — Agents read/write the same Supabase tables; no direct agent-to-agent chat required.
2. **Orchestrator broker (active)** — Magnus calls agent A, passes result as context to agent B when order matters.
3. **Direct tool coupling** — One agent exposes another as a tool when latency or coupling demands it.

Planned cross-cutting mechanisms include **caching with TTL**, a **computation registry** (avoid duplicate work), and **dirty flags** when upstream data changes.

---

## 6. Intelligence & modes (target)

### Deviation detection (conceptual levels)

- **Level 1:** Single KPI breach → nudge via relevant pillar logic.
- **Level 2:** Multiple signals in one pillar → structured check-in.
- **Level 3:** Cross-pillar pattern → orchestrator-led conversation (not visible as isolated pillar fixes).

### Operating modes (examples)

- **Normal** — Steady operation.
- **Good streak** — Reserve up; allow slightly more ambition and explicit celebration.
- **Rough patch** — Ease pressure, fewer pings, softer tone.
- **Intervention** — Sustained difficulty; lead with a human conversation, not only goal mechanics.

---

## 7. Agent architecture (LifeOS build plan)

The hierarchical design separates **orchestrator** from **specialists**. Examples from the product plan:

- **Orchestrator** — Inbound messages, intent classification, delegation, response synthesis, conversation state (e.g. Redis).
- **Pillar agents** — Health, Wealth, Wisdom, Joy (domain prompts, one-thing, milestones, Joy tank bands and repositories).
- **Memory** — Tiered context (e.g. 3d / 7d / 30d / 90d summaries), patterns, goals, Joy tank.
- **Pattern detection** — Nightly jobs, embeddings, tentative → emerging → confirmed patterns.
- **Morning brief / Check-in / Review / Emergency** — Ritual automation tied to LifeOS templates and storage (Notion + DB).

Agents implement a common **execute(input) → output** shape so the orchestrator stays thin.

**Vector memory (target):** Embeddings on reflections, pgvector similarity, tiered summarisation cadence.

---

## 8. This repository — what exists today

Ground truth: **`magnus.md`**. Summary:

| Area | Status |
|------|--------|
| **Entry** | `src/index.ts` — health server + Telegram bot + `handleMessage` |
| **Orchestrator** | `src/agents/magnusOrchestrator.ts` — keyword/LLM intent, memory, route or reply (`src/magnus.ts` gates + chat log) |
| **Intents** | `HEALTH` … `NOTION`, `GENERAL` (`src/intent.ts`) |
| **Routing** | Non-`GENERAL` → `dispatchToAgent` when registered (**NOTION**, **HEALTH**, **PLANNING**, **LEARNING**); else placeholder; `GENERAL` → Research sub-route or short Claude reply |
| **Persistence** | `user_profile`, `magnus_chat_messages` wired; domain tables for goals/tasks/KPIs **not** fully wired yet |
| **Agents** | `src/agents/` — Notion, Health composite, Planner, Research, Memory context; more departments **next phase** |
| **Infra** | Supabase (RLS + service role), Redis (rate limits), Express `/health` + `/ready`, structured logging |

So: **philosophy and multi-agent design are ahead of the code**, but the **spine** (identity, chat log, intent enum, gates, health checks) matches the direction of a single orchestrator service.

---

## 9. Vision ↔ code alignment

| Vision element | In repo now |
|-----------------|------------|
| Single orchestrator persona (Magnus) | Yes — Claude system prompts in `magnus.ts` |
| Pillar-aware routing | Partial — intents exist; specialist handlers are placeholders |
| Joy tank / patterns / briefs / MVD | Planned — requires agents + scheduled jobs + domain writes |
| Notion as NL / documentation surface | **Partially wired** — server uses `@notionhq/client` (`src/tools/notion.ts`, Notion agent); Cursor MCP remains IDE-only |
| WhatsApp vs Telegram | Docs mention WhatsApp; **this codepath is Telegram** |

---

## 10. External references (Notion)

These pages expand detail without duplicating secrets here:

- **LifeOS hub** — `https://www.notion.so/32cb455af233811b9e29fcd84f710759`
- **LifeOS — Build Master** — `https://www.notion.so/32eb455af23381519d6be61a92eded4f`
- **MAGNUS — Master Architecture & Plan** — `https://www.notion.so/33fb455af23381c8bc1edc33e1775782`
- **Agent Architecture** — `https://www.notion.so/32eb455af233816aad7eeaa50baf5b00`

**Security:** API keys and tokens belong in **environment variables** and secret managers — not in this file or in committed chat logs.

---

## 11. How to use this file

- **New session / new contributor:** Read this for intent and architecture; read **`magnus.md`** for operational truth; read **`docs/AGENT_ROSTER.md`** to review agents and prompts.
- **When shipping features:** If you change the *meaning* of Magnus (orchestrator responsibilities, pillar rules, or user-facing promises), update **this file** and **`magnus.md`** together.
