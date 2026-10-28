# Magnus — Activity Taxonomy

**Version:** 1.0  
**Last updated:** 2026-08-10  
**Status:** Active — bedrock for product and routing decisions  
**See also:** [`PROJECT_DEFINITION.md`](PROJECT_DEFINITION.md), [`VISION.md`](VISION.md)

---

## 1. Two orthogonal axes

| Axis | Question | Values |
|------|----------|--------|
| **Pillars** | Which domain of life? | Health, Wealth, Wisdom, Happiness |
| **Activity layer** | How is work structured? | Operations, Goals, Projects |

---

## 2. Activity layers

### Operations

Recurring or ad-hoc life maintenance — **no project wrapper, no end deadline**.

Subcategories: `routine`, `reminder`, `admin`, `recurring_commitment`.

Examples: daily gym + log + prep, pay bills, bike repair, ongoing study blocks.

Stored as: `magnus_events`, lists, reminders — without `project_id`.

### Goals

Long-horizon SMART outcomes the user is building toward.

Examples: save ₹1 Cr by 2028, BMI < 25, earn X income.

Stored as: `goals` table (`timeframe`: north_star → weekly).

### Projects

Bounded initiatives with **clear outcome + deadline**.

Examples: lose 10 kg by June, plan Bali trip, job search Q2, learn SQL in 8 weeks.

Stored as: `projects` + `features` (milestones) + checklist list.

See [`PROJECT_DEFINITION.md`](PROJECT_DEFINITION.md).

---

## 3. Bedrock decision rules

```
1. Clear end outcome + deadline?           → Project
2. Measurable long-horizon outcome?        → Goal (SMART)
3. Recurring maintenance / ad-hoc ops?     → Operations
4. Which pillar owns domain judgment?      → Pillar agent / KPI
5. Needs calendar/lists/events?            → Operations tools (any agent)
6. Needs pillar depth (meals, career)?   → Pillar executor + optional ops tools
7. Competing active projects?              → Level 3 orchestrator; MVD on deprioritized
8. Any tool use or write claim?            → Accountability Agent before user sees reply
```

### Gym litmus test

| Situation | Layer |
|-----------|--------|
| Daily gym, logging, prep reminders | **Operations** |
| Lose 10 kg by June | **Project** |
| BMI < 25 | **Goal** |

---

## 4. Naming: Operations vs `GENERAL` intent

| Term | Meaning |
|------|---------|
| **Operations** | Activity category — BAU life maintenance |
| **`GENERAL` intent** | Routing label for Magnus-lane execution (tools, day overview) — **not** the Operations category |
| **Operations tools** | Shared calendar, lists, event log, journal, LifeOS, proactive, YouTube, Notion — callable by any agent |

Never say "route to General" when meaning Operations BAU.

---

## 5. Relationships

```
Goals ──(optional)──► Projects ──(spawn)──► Operations (tagged with project_id)
Pillars ──(domain judgment)──► all layers
Accountability Agent ──(vets)──► all tool writes
```
