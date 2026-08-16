# Magnus Ideas — Product Backlog (post–v1 hardening)

**Purpose:** Ideas for Magnus **after** v1 hardening (PR #91–#100) or as explicit v2+ bets.  
**Not in this doc:** Bug fixes, gap closure, and integration hardening — those live in [`docs/review/V1_HARDENING_PLAN.md`](../review/V1_HARDENING_PLAN.md).

**How to use:**
- Owner or agent adds ideas here with a new `IDEA-###` id.
- Do **not** implement from this doc during v1 hardening unless the owner assigns a specific id.
- When shipping an idea, move status to `shipped` and note the PR in the row.

**Sources:** Product review (2026-08-14–16), real Telegram chat analysis (Supabase `magnus_chat_messages`, Aug 2–16 2026), [`MAGNUS_V1_OPPORTUNITIES.md`](../review/MAGNUS_V1_OPPORTUNITIES.md).

| Status | Meaning |
|--------|---------|
| `idea` | Captured, not scheduled |
| `candidate` | Strong fit; pick after v1 |
| `scheduled` | Assigned to a version/milestone |
| `shipped` | In production |
| `wontfix` | Rejected or blocked |

---

## Priority tiers (after PR #100)

| Tier | When | Focus |
|------|------|-------|
| **A** | v1.1 / early v2 | High impact, fits current architecture |
| **B** | v2.x | Strong chief-of-staff; more build |
| **C** | v3+ / blocked | Large bets or external blockers |

---

## Tier A — High impact (recommended first after v1)

| ID | Idea | Pillar | Source | What you'd say / get | Builds on | Status |
|----|------|--------|--------|----------------------|-----------|--------|
| **IDEA-001** | **Pillar balance snapshot** | Cross | Chat review | "How are my pillars?" → status, joy tank, last check-in, which is at risk | `pillar_status`, `happiness_reserve`, check-ins | candidate |
| **IDEA-002** | **Project weekly checkpoint** (proactive) | Cross | Chat review | Proactive per active project: checklist progress, milestone due, one next action | `projects`, `project_status`, proactive | candidate |
| **IDEA-003** | **Taste memory from lists** | Joy | Real chat (watchlist) | "Pick a movie" → prefer unread items from watchlist/readlist, not generic picks | Lists + Happiness context | candidate |
| **IDEA-004** | **Habit / adherence view** | Health | Real chat (gym, Hevy) | "Gym adherence this month?" → event stats + Hevy sessions, deterministic | `magnus_event_activity_stats`, events | candidate |
| **IDEA-005** | **Day builder** (one-shot) | Cross | Real chat (Aug 15–16) | One message builds full day: calendar blocks + event log + meal slice + reminders | calendar, events, day_overview | candidate |
| **IDEA-006** | **Friday errand batch template** | Cross | Real chat (Aug 14) | "Friday errands" → recurring template (pest control, services, mandir, etc.) + batch reminders | `custom_reminder`, lists | idea |
| **IDEA-007** | **Meal prep Sunday flow** | Health | Chat review | Proactive: plan week + shopping list in one orchestrated nudge | `week_planning`, meal planning | idea |
| **IDEA-008** | **Weekly pillar review** (proactive) | Cross | LifeOS philosophy | Friday: per-pillar one-liner + one suggested action | `weekly_wrap`, LifeOS | idea |
| **IDEA-009** | **Hobby / pet happiness projects** | Joy | Real chat (Aug 16 coriander) | Photo progress tracker for plants, crafts, pets — not meal log, not generic chat | Projects theme or new `hobby` theme; vision `list_items` / project | candidate |
| **IDEA-010** | **Creative mic prep project** | Joy | Real chat (Aug 15–16 poetry) | Poem for wife / poetry mic: find → practice → perform checklist + reminders | Poetry list + project FSM | idea |
| **IDEA-011** | **Poetry / Stories list workflow** | Joy | Real chat (Aug 15) | "Poetry idea" → Poetry list; draft share updates status; dedupe Notion on sync | Custom lists + Notion | idea |
| **IDEA-012** | **Home maintenance ops board** | Cross | Real chat (Aug 14–16) | Vendor visits (plumber, pest, fridge) as ops batch: schedule → mark done → weekly pending | event log, lists | idea |
| **IDEA-013** | **Goal progress tracking** | Cross | PRD / chat review | Goals show checkpoints; quarterly review nudge | `goals` table | idea |

---

## Tier B — Strong chief-of-staff (v2.x)

| ID | Idea | Pillar | Source | What you'd say / get | Notes | Status |
|----|------|--------|--------|----------------------|-------|--------|
| **IDEA-020** | **Semantic memory (pgvector)** | Cross | Vision / roadmap | "What did we decide about Bali budget last month?" | Journal + facts embeddings | idea |
| **IDEA-021** | **Deviation detection L1–L3** | Cross | LifeOS philosophy | Magnus notices drift: missed gym ×3, joy tank drop, pillar at risk | Not built; core LifeOS | idea |
| **IDEA-022** | **Operating modes** | Cross | LifeOS philosophy | Rough patch / MVD / intervention — adjusts nudge intensity and expectations | Emergency protocol | idea |
| **IDEA-023** | **MVD on gym skip** | Health | Real chat (Aug 13, 16) | Skip gym → log reason, minimum dose option, track training debt without guilt spiral | Links IDEA-021 | idea |
| **IDEA-024** | **Wealth goals → `goals` table** | Wealth | PRD D-5 | Savings targets persist from conversation; show in wealth turns | Write path from wealth | idea |
| **IDEA-025** | **Receipt → spend log** | Wealth | Vision receipt routing | Photo receipt → categorized spend row | New store + vision | idea |
| **IDEA-026** | **Budget check-in** | Wealth | Chat review | Monthly spend reflection from manual log (no bank API) | IDEA-025 optional | idea |
| **IDEA-027** | **Learning progress tracker** | Wisdom | Chat review | Skill sprint % from project checklist milestones | Projects + Wisdom | idea |
| **IDEA-028** | **Notion two-way sync** | Cross | Real chat (Aug 15 duplicates) | Edit list in Notion → reflects in Telegram | Beyond mirror hardening | idea |
| **IDEA-029** | **Evening brief w/ tomorrow calendar** | Cross | Tier B from opportunities | Evening journal references tomorrow's calendar blocks | After brief calendar hardening | idea |
| **IDEA-030** | **Swimming as distinct activity** | Health | Real chat (Cult HSR) | Swim sessions separate from gym in event log + reconcile rules | Not Hevy-gym path | idea |
| **IDEA-031** | **Work block tagging** | Wisdom / Cross | Real chat (office vs Magnus work) | Calendar blocks tagged: office work, Magnus deep work, admin; weekly wrap by tag | calendar metadata | idea |
| **IDEA-032** | **Meal rules profile** | Health | Real chat (lauki, alternation, Friday burger) | Persistent rules: avoid foods, breakfast/lunch alternation, Friday exceptions — beyond one-off plan fixes | `user_program_memory` | idea |
| **IDEA-033** | **Vendor / home project theme** | Cross | Real chat (room reorganise Aug 16) | Project theme: room makeover, maintenance sprint with checklist + time blocks | `event_plan` / custom theme | idea |

---

## Tier C — Deferred / blocked

| ID | Idea | Blocker | Status |
|----|------|---------|--------|
| **IDEA-040** | Kite order placement | MF 403; equity needs static IP + CONFIRM flow | wontfix (for now) |
| **IDEA-041** | Bank / card auto-import | No integration | idea |
| **IDEA-042** | Web dashboard | v3 — move off Telegram | scheduled (v3) |
| **IDEA-043** | Multi-user onboarding journey | v2 roadmap | scheduled (v2) |
| **IDEA-044** | WhatsApp interface | Out of repo scope | wontfix |

---

## Real chat patterns → ideas (evidence)

From **364 user messages** (Aug 2–16 2026). These motivated the ideas above; fixing broken behaviour is **hardening**, not this doc.

| You actually do | Idea id(s) | Hardening (fix, don't new-feature) |
|-----------------|------------|-------------------------------------|
| Log meals, plans, corrections | — | Meal dedupe, present tense, plan context (#95) |
| Build full days (swim, office, gym, mic) | IDEA-005 | Calendar read, day_overview (#94) |
| Friday errand batches | IDEA-006 | Reminders + calendar (#94) |
| Hevy + review + log in one ask | — | `pillar_consultation` (#93, #96) |
| Watchlist + "recommend from list" | IDEA-003 | List recommend filters (#97) |
| Poetry / stories / wife / mic | IDEA-010, IDEA-011 | — (new workflow) |
| Coriander photo project | IDEA-009 | Photo ≠ meal routing (#95) |
| Skip gym when tired | IDEA-023 | — (MVD mode) |
| Home vendors + room reorganise | IDEA-012, IDEA-033 | Event log mark-done (#94) |
| Morning brief + win intention | — | Brief accuracy + calendar (#94) |

---

## Recommended pick order (owner default)

After PR #100 smoke test passes:

1. **IDEA-005** — Day builder (your most repeated multi-turn pattern)
2. **IDEA-009** — Hobby projects (surfaced Aug 16)
3. **IDEA-003** — Taste from lists
4. **IDEA-002** — Project weekly checkpoint
5. **IDEA-001** — Pillar balance snapshot

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-16 | Initial backlog from product review + real Telegram chat analysis. Non-hardening items only. |

---

**Last updated:** 2026-08-16
