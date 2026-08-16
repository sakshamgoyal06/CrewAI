# Magnus v1 Opportunities — What Magnus Can Do Next

**Purpose:** Synthesized from product review (2026-08-14–16): current capabilities, v1 close gaps, and **what to add** after v1 or during hardening if low-risk.  
**Master plan:** [`V1_HARDENING_PLAN.md`](./V1_HARDENING_PLAN.md)  
**Not a commitment** — prioritization for owner; agents should not implement without explicit assignment.

---

## 1. What Magnus already does for you (today at PR #90)

Use this as the baseline when deciding what to add.

### Daily chief-of-staff loop
- **Morning orientation** — proactive or manual morning brief (event log + LifeOS; calendar gap closing in PR #94)
- **Day planning** — calendar read/write, event log commitments, holistic day overview
- **Capture in motion** — meals (NL + photo), gym, notes, list items, check-ins
- **Evening close** — health journal, evening journal nudge, joy tank, pillar scores
- **Rhythm** — week planning, weekly wrap, monthly goal review (subscription-based)

### Four pillars (invisible routing)
| Pillar | What Magnus does today |
|--------|------------------------|
| **Health** | Meal log/plan, macros, Hevy coaching + writes, fitness program memory, nutrition advice, energy/recovery, health journal |
| **Wealth** | Money coaching; Zerodha read-only portfolio when connected |
| **Wisdom** | Learning plans, career direction, project shipping coaching, skill practice |
| **Joy** | Taste recommendations, rest/travel, relationships, creative practice; lists + YouTube for *actions* |

### Activity layers
- **Operations** — calendar, events, lists, reminders, meal/gym logging
- **Goals** — `add_goal`, LifeOS goals list, monthly review
- **Projects** — 6 themes, setup FSM, checklist, milestones, conflict detection

### Integrations
Google (Calendar + YouTube), Notion, Hevy, Kite (read), USDA/CalorieNinjas for macros.

---

## 2. What v1 hardening unlocks (PR #91–#100 — in scope)

These are **not new features** — they make existing Magnus actually feel like a chief of staff:

| Unlock | Why it matters for you |
|--------|------------------------|
| Calendar in morning brief + day overview | Brief reflects real schedule, not just event log |
| LifeOS write → memory read loop | Joy tank, pillar status, goals inform every turn |
| Rich list recommendations | "Pick from my watchlist" actually works with filters |
| Four-pillar context every turn | Wealth/Joy/Wisdom replies reference *your* data, not generic chat |
| Projects end-to-end on all themes | Job search, trip, transformation, etc. without DB fixes |
| Proactive rhythm tuned | Right nudge, right time — not noise |
| Connection smoke matrix | Confidence everything is wired |

---

## 3. High-value additions — recommend for v1.1 / early v2 (after PR #100)

Ranked by impact on **your** stated goals (natural chat, chief of staff, goal-aligned).

### Tier A — High impact, fits existing architecture

| # | Capability | What it would do for you | Builds on | Effort |
|---|------------|--------------------------|-----------|--------|
| A1 | **Pillar balance dashboard in chat** | "How are my pillars?" → deterministic snapshot: status, joy tank, last check-in, which pillar is at risk | `pillar_status`, `happiness_reserve`, `log_daily_checkin` | Low — mostly read + format |
| A2 | **Weekly pillar review (proactive)** | Friday message: per-pillar score, one sentence each, one suggested action | Rhythm + LifeOS reads | Low — new kind or extend `weekly_wrap` |
| A3 | **Goal progress tracking** | Goals show % or checkpoint status; Magnus asks quarterly review | `goals` table + conversation | Medium — needs write path from wealth/wisdom turns |
| A4 | **Taste memory from lists** | Joy recommendations prefer watchlist/readlist items not yet consumed | Lists + happiness agent context | Medium — PR #97 list schema work |
| A5 | **Budget check-in (Wealth)** | Monthly: "what did I spend on X" from manual log or receipt photos | Vision receipt + wealth prompt | Medium — no bank API yet |
| A6 | **Project weekly checkpoint** | Proactive: "Job search week 3 — 2/5 checklist done" per active project | Projects + proactive | Low — extend `project_status` |
| A7 | **Habit streak / adherence view** | "How's my gym adherence this month?" from event stats + Hevy | `magnus_event_activity_stats` | Low — deterministic read |
| A8 | **Meal prep Sunday prompt** | Proactive: plan week + shopping list in one flow | Meal planning + week_planning kind | Low — orchestration only |

### Tier B — Strong chief-of-staff, more build

| # | Capability | What it would do for you | Notes |
|---|------------|--------------------------|-------|
| B1 | **Semantic memory (pgvector)** | "What did I decide about Bali budget last month?" | v2 roadmap item; journal + facts embeddings |
| B2 | **Deviation detection L1–L3** | Magnus notices drift before you do — missed gym 3x, joy tank drop | LifeOS philosophy; not built |
| B3 | **Operating modes** | Rough patch / MVD / intervention — adjusts nudge intensity | LifeOS emergency protocol |
| B4 | **Wealth goals → `goals` table** | Savings targets persist from conversation | PRD D-5 not started |
| B5 | **Receipt → spend log** | Photo receipt → categorized spend row (Wealth operations) | Vision + new store |
| B6 | **Learning progress tracker** | Wisdom: skill sprint % complete from checklist | Projects + Wisdom depth |
| B7 | **Notion two-way sync** | Edit watchlist in Notion → reflects in Telegram | Mirror today is partial |
| B8 | **Calendar in all brief contexts** | Not just morning — evening journal references tomorrow calendar | PR #94 foundation |

### Tier C — Deliberately deferred / blocked

| # | Capability | Blocker |
|---|------------|---------|
| C1 | Kite order placement | MF 403; equity needs static IP + CONFIRM flow |
| C2 | Bank / credit card auto-import | No integration |
| C3 | Web dashboard | v3 |
| C4 | Multi-user onboarding | v2 |
| C5 | WhatsApp | Out of scope |

---

## 4. "What should Magnus do for me?" — persona-based map

Based on your LifeOS philosophy and how you use Magnus as owner:

### As CEO (you)
- Hold **north star** in every memory block
- Surface **balance penalty** when any pillar drops
- Run **monthly goal review** without you initiating
- **Conflict detection** when too many active projects

### As operations manager
- **Locked day** — morning brief + day overview so you don't re-decide
- **Event log** as commitment source of truth (not just calendar)
- **Gym ↔ Hevy reconcile** so adherence is automatic
- **Custom reminders** with natural language time

### As health coach
- **Meal log without friction** — NL, photo, undo, slot correction
- **Meal plan journey** — week menu, shopping, adherence nudges
- **Program memory** — weekly schedule drives fitness answers
- **Nutrition nightly** — patterns sync to coaching tone

### As wealth advisor (read-only)
- **Portfolio context** in wealth turns when Kite connected
- *(Future)* savings goal tracking, spend logging, budget vs actual

### As joy curator
- **Lists** for watch/read/travel/food/music
- **Recommend from saved lists** (v1 close: rich filters)
- **YouTube** search, playlists by pillar, bookmarks, cue
- **Joy tank** — protected wellbeing signal, not gamified

### As wisdom mentor
- **Learning plans** and career coaching
- **Project shipping** inside active projects (job search, skill sprint)
- *(Future)* tie checklist milestones to wisdom capabilities

### As project collaborator
- **6 themes** with honest limits ("I can't book flights — here's checklist")
- **Status synthesis** on demand
- **Stagnation nudges** when checklist stalls

---

## 5. Suggested roadmap after v1 complete

| Phase | Focus | Example deliverables |
|-------|-------|----------------------|
| **v1.1** (post PR #100) | Polish from smoke test failures only | Bug fixes, no new surface |
| **v2.0** | Onboarding + alpha users | Provision flow, taste memory, goal progress |
| **v2.x** | Depth where earned | Wealth spend log, semantic memory, deviation L1 |
| **v3.0** | UI beyond Telegram | Dashboard, mobile surface |
| **Beta (Nov 2026)** | External users | Per `MAGNUS_VERSIONS.md` |

### Recommended first five additions after v1 (owner priority)

1. **A1** — Pillar balance snapshot on demand
2. **A6** — Project weekly proactive checkpoint
3. **A4** — Taste memory from lists (completes Joy pillar grounding)
4. **A7** — Habit/adherence view (gym, meals)
5. **B4** — Wealth goals persist to `goals` table

---

## 6. How agents should use this doc

- **During v1 hardening (#91–#100):** Only implement items listed in `V1_HARDENING_PLAN.md`. Do not add Tier A/B features unless owner explicitly assigns.
- **After PR #100:** Owner picks from Tier A/B; create new PR with reference to opportunity ID (e.g. `A1-pillar-balance-snapshot`).
- **When auditing:** If a Tier A item is really a "gap" in existing feature (e.g. list recommend broken), fix under v1 hardening, not as new feature.

---

## 7. Questions for owner (optional prioritization)

1. After v1, is **Joy depth** (lists + recommendations) or **Wealth depth** (goals + spend) higher priority?
2. Do you want **proactive pillar balance** weekly, or only on demand?
3. Is **semantic memory** worth cost before beta, or wait for volume?
4. Should **Notion** remain human-readable source of truth, or Supabase-only with Notion optional?

---

**Last updated:** 2026-08-16
