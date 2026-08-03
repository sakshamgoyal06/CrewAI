# TODO — List recommendation schemas (all default lists)

**Status:** Not started  
**Goal:** Default lists should support *queryable* recommendations — not just title + queue status.  
**Example queries that must work after this work:**

- “Recommend a short thriller I haven’t seen before.”
- “Suggest a Hindi drama I can rewatch — rated 5/5, not watched in the last 3 months.”
- “What book on my readlist fits a rainy weekend?”
- “Pick a restaurant from my food list near South Delhi we haven’t tried.”

**Related:** `docs/NOTION_LIFEOS_STRUCTURE.md` §4 (ideal media DB), `src/lists/listCatalog.ts`, `magnus_list_items.extra`.

---

## Problem (today)

| Layer | Gap |
|-------|-----|
| **Supabase** | `magnus_list_items` has `title`, `status`, `notes`, `url`, `author`, `priority`, `extra` JSONB — no typed recommendation fields |
| **Status model** | Open queues only (`Want to Watch`, `Reading`, …) — no **completed / watched / visited** lifecycle with dates |
| **Tools** | `list_items` filters by `status` / `open_only` only — no genre, language, rating, runtime, date ranges |
| **Notion provision** | Auto-created DBs: Title + Status + Notes (+ URL) — not recommendation-rich |
| **Agents** | Happiness recommends from LLM taste; Magnus reads open highlights — neither runs structured filters |

---

## Design principles

1. **Supabase canonical** — query fields live in typed columns or a validated `extra` schema per archetype.
2. **Notion mirrors the same fields** — provision + mirror read/write stay in sync.
3. **Archetype-driven** — one schema definition per `ListArchetype` in `listCatalog.ts`, not per-slug one-offs.
4. **Lifecycle statuses** — every queue archetype gets `open` + `done` states and `completed_at` / `last_engaged_at`.
5. **Recommend tool** — Magnus gets `recommend_list_items` (or extend `list_items` with filters) that executes SQL/JSON filters, not LLM guesswork.

---

## Phase 1 — Schema definitions (code + migration)

- [ ] Add `ListItemFields` / archetype field maps in `src/lists/listFieldSchemas.ts` (new)
- [ ] Document each archetype’s fields, types, and example recommendation queries
- [ ] Migration: optional typed columns on `magnus_list_items` **or** enforce `extra` shape via zod per archetype  
  - Prefer columns for filter-heavy fields: `rating`, `runtime_minutes`, `language`, `genres[]`, `last_engaged_at`
  - Keep long-tail in `extra` until proven
- [ ] Extend `ListTemplate` with `recommendationFields`, `doneStatuses`, `statusFlow`

### Per-archetype target fields

| Slug | Archetype | Fields for recommendations |
|------|-----------|---------------------------|
| **watchlist** | `media_queue` | `media_type` (film/show), `genres[]`, `language`, `runtime_minutes`, `rating` (1–5), `last_watched_at`, `rewatchable`, `director`, `url` |
| **readlist** | `reading_queue` | `author`, `genres[]`, `format` (book/article), `page_count`, `rating`, `finished_at`, `language` |
| **travel** | `place_queue` | `region/country`, `trip_type`, `season`, `budget_band`, `visited_at`, `rating`, `duration_days` |
| **food** | `food_queue` | `cuisine`, `location/area`, `meal_type`, `price_band`, `tried_at`, `rating`, `diet_tags[]` |
| **music** | `music_queue` | `artist`, `album`, `genres[]`, `mood[]`, `language`, `rating`, `last_listened_at`, `url` |
| **tasks** | `task_queue` | `due_date`, `pillar`, `priority`, `energy_cost`, `context` (home/errand/deep) — **partially exists** |
| **goals** | `goal_queue` | `pillar`, `timeframe`, `target_date`, `progress_pct`, `status` — **partially exists** |
| **experiences** | `experience_queue` | `category` (event/hobby/social), `mood`, `duration_hours`, `location`, `done_at`, `rating`, `energy` |
| **patterns** | `pattern_log` | `pillars[]`, `strength`, `first_seen_at`, `last_confirmed_at` — recommend *insights*, not picks |
| **checkins** | `checkin_log` | Already date-keyed; pillar scores in Notion — extend read for trend recommendations |

### Status lifecycle (all queue archetypes)

- [ ] Add **done** statuses: e.g. `Watched`, `Read`, `Visited`, `Tried`, `Listened`, `Done`, `Completed`
- [ ] Wire `update_list_item` → set `completed_at` when moving to done status
- [ ] `list_items` / recommend: `include_done`, `done_since`, `not_engaged_since` filters

---

## Phase 2 — Tools & API

- [ ] Extend `add_list_item` / `update_list_item` tool schemas with archetype-aware optional fields
- [ ] Extend `list_items` or add **`recommend_list_items`**:
  - `list`, `filters` (genre, language, max_runtime, min_rating, not_seen, rewatchable, engaged_before, …)
  - Returns ranked rows with *why* each matched
- [ ] `formatItemLine` — include key recommendation fields in tool output (not just title + status)
- [ ] Validation on write (zod) — reject invalid ratings, unknown enums

---

## Phase 3 — Notion provision & mirror

- [ ] Update `notionPropertiesForTemplate()` in `notionProvision.ts` for all archetypes
- [ ] Update `listNotionMirror.ts` read/write for new properties
- [ ] Migration path: **`setup_notion provision`** upgrades existing Magnus DBs (add columns, don’t wipe rows)
- [ ] Optional: single **Media & Experiences** DB with `list_type` view per slug (see `NOTION_LIFEOS_STRUCTURE.md` §4.2)

---

## Phase 4 — Agent behaviour

- [ ] `magnusCorePrompt` + Happiness: route structured media/book/food asks to `recommend_list_items`, not free-form only
- [ ] Memory highlights: include genre/rating snippets where present
- [ ] Example-driven tests: fixture rows → assert filter results for thriller / Hindi rewatch queries

---

## Phase 5 — Enrichment (optional, high value for watchlist)

- [ ] TMDB / OMDb lookup on `add_list_item` when title + media_type provided (genre, runtime, language auto-fill)
- [ ] YouTube link for music list items when URL missing
- [ ] Never block add if enrichment fails — manual fields always work

---

## Acceptance criteria

1. **Watchlist:** “short thriller not seen” returns only open or unseen rows with genre thriller and runtime ≤ 100 (or empty runtime + enrichment).
2. **Watchlist:** “Hindi drama rewatch 5/5, not in 3 months” returns done rows with matching filters.
3. **Readlist / food / travel / music:** at least one filter dimension each beyond title/status.
4. **Tasks / goals:** “what should I do today?” can filter by due date + pillar + priority.
5. Notion Magnus space DBs expose the same fields Magnus queries in Supabase.

---

## Implementation order (suggested)

1. Schema module + watchlist (highest user ask)  
2. `recommend_list_items` + tool wiring  
3. Notion provision + mirror for watchlist  
4. Roll out remaining archetypes  
5. TMDB enrichment  

---

**Last updated:** 2026-08-03
