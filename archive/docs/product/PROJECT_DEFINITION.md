# Magnus — Project Definition

**Version:** 1.0  
**Last updated:** 2026-08-10  
**Status:** Active — bedrock for project features and themes  
**See also:** [`ACTIVITY_TAXONOMY.md`](ACTIVITY_TAXONOMY.md), [`VISION.md`](VISION.md)

---

## 1. One sentence

A **Project** is a **time-boxed collaboration** between the user and Magnus with a **written definition of done**, a **deadline**, and a **shared plan** Magnus helps execute — through advice, operations-tool actions, and honest tracking when Magnus cannot act externally.

---

## 2. What a project is not

- Not a task app the user maintains separately from chat
- Not a separate chat mode or Telegram command
- Not a sixth pillar — projects span pillars via context injection
- Not the same as Wisdom `project_shipping` (that capability coaches *inside* a project)

---

## 3. Anatomy (theme-agnostic)

Every project has the same parts. **Themes** only pre-fill checklist, milestones, and pillar bias.

| Part | Required | Storage | Purpose |
|------|----------|---------|---------|
| Title | Yes | `projects.title` | Human label |
| Definition of done | Yes | `projects.outcome` | Unambiguous end state |
| Deadline | Yes | `projects.target_date` | Time-box; nudges; conflict detection |
| Status | Yes | `projects.status` | `planning` → `active` → `paused` \| `completed` \| `abandoned` |
| Primary pillar | Yes | `projects.primary_pillar` | Domain judgment owner |
| Linked goal | No | `projects.goal_id` | Upward link to Goals layer |
| Why now | No | `projects.north_star_note` | Coaching tone anchor |
| Priority rank | Yes | `projects.priority_rank` | Among active projects (1 = highest) |
| Energy budget | Yes | `projects.energy_budget` | `high` \| `medium` \| `low` — conflict + MVD |
| Milestones | Yes (≥1) | `features` table | Checkpoints with optional dates |
| Checklist | Yes | `magnus_user_lists` row | Items Magnus tracks and nudges |
| Theme | No | `projects.project_type` | `custom` or named theme — defaults only |
| Config | No | `projects.config` JSONB | Theme-specific fields |

**Supporting Operations** (gym prep, bill reminders) live in the Operations layer (`magnus_events`, lists) with `metadata.project_id` when spawned by a project.

---

## 4. Lifecycle

| Phase | User experience | Magnus (internal) |
|-------|-----------------|-------------------|
| Spark | "Planning Bali in April" | Detect intent; optional one clarifying question |
| Planning | Short Q&A on outcome, deadline, progress so far | `project_sessions` FSM |
| Confirm | "Looks good" / "lock it in" | Create `projects` row, checklist, milestones |
| Active | Same thread — progress, advice, scheduling | Pillar + ops tools; tag `project_id` |
| Check-in | "How's job search going?" | `project_status` synthesis |
| Stuck | — | Name blockers; no fake external actions |
| Conflict | One-sentence prioritization ask | `projectConflictService`; MVD on deprioritized |
| Complete | "Offer signed" | Mark completed; stop project nudges |
| Pause / drop | "Pause Bali until June" | Status update; freeze checklist |

**Soft limit:** max **3 active** projects.

---

## 5. Architecture hooks

Projects inject context at:

- `userKnowledge.ts` — active projects block in memory
- `buildRoutingHints.ts` — `active_projects[]`, session flags
- `parsePillarStrategy.ts` — `project_setup`, `project_manage`, `project_status`
- Pillar executors — project snippet in system prompt
- Operations tools — optional `project_id` on writes
- `accountabilityAgent.ts` — ledger entries include `project_id` when scoped
- Proactive cron — stagnation / weekly review kinds

---

## 6. User experience rules

1. No project mode, menu, or extra commands
2. One Magnus voice always
3. Honest limits: "I can't book flights — here's what's left on your list"
4. Unrelated turns (e.g. meal log) get no project preamble

---

## 7. How Magnus helps (roles, one voice)

| Role | Examples |
|------|----------|
| Coach | Interview prep, itinerary tradeoffs, nutrition guidance |
| Assistant | Calendar blocks, list items, reminders |
| Executor | Confirmed ops-tool writes (Accountability vetted) |
| Intern | Drafts user acts on — never sent externally |
| Colleague | Status, stagnation callouts, conflict nudges |

**v1 can:** checklist, milestones, calendar, lists, reminders, pillar depth, progress synthesis.  
**v1 cannot:** book flights, submit applications, pay bills — fallback to checklist + nudge.

---

## 8. Themes

Themes are declarative overlays (`src/projects/themes/`). They do not change anatomy or lifecycle.

Build **`custom`** first (empty defaults), then named themes (`job_search`, `trip_plan`, `transformation`, …).
