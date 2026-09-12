# Minimal mode experience audit — why Magnus feels useless

**Date:** 2026-09-12
**Scope:** `MAGNUS_MINIMAL_MODE=true` (production default). Phase 1 focus per
[`MINIMAL_MODE_FOCUS.md`](../product/MINIMAL_MODE_FOCUS.md): **workouts, calendar, lists, reminders, logging**.
**Evidence:** hosted Supabase `xdrpjfdhduskhzryevze`, 2026-08-02 → 2026-09-12 (42 days, 1 real user
profile `d7fc8dd1…`, `Asia/Kolkata`), plus code paths on `main` @ `9204415`.

---

## Verdict

Minimal mode is not failing because the scope is too small. It is failing because **the closure half
of the loop has never run in production**, and because **three of the five focus areas silently drop
user writes**. Magnus asks questions every morning and never collects the answers; it accepts
commitments and never confirms them; and when a write fails it either euphemises the failure or says
nothing at all.

The product promise of Phase 1 is *"is the user sticking to their plan, or are commitments failing?"*
In 42 days of real use Magnus has **never once asked that question**, because the mechanism that asks
it (`evening_journal`) has no subscription row.

The result is an assistant that **broadcasts and forgets**. It talks *at* the user on a fixed 07:00
schedule, cannot be corrected, cannot be stopped, and keeps no memory of outcomes. That is the exact
opposite of "live and breathing" — it is a cron job with good prose.

---

## 1. The closure loop has never fired — not once

Every Magnus-initiated message in 42 days, by kind:

| Proactive kind | Sends | First | Last |
|---|---|---|---|
| `custom_reminder` | 38 | 2026-08-14 | 2026-09-12 |
| `morning_brief` | 35 | 2026-08-02 | 2026-09-12 |
| `gym_hevy_reconcile` | 6 | 2026-08-07 | 2026-09-11 |
| `event_reminder` | 3 | 2026-08-08 | 2026-08-14 |
| **`evening_journal`** | **0** | — | — |
| **`evening_log_followup`** | **0** | — | — |
| **`activity_completion`** | **0** | — | — |
| **`drift_guard`** | **0** | — | — |

### Root cause: zero rhythm subscriptions exist

`magnus_proactive_subscriptions` holds **13 rows, all `kind='custom_reminder'`, all
`trigger_type='one_shot'`**. There is no `evening_journal` row, no `week_planning`, no `weekly_wrap`,
no `monthly_goal_review`, no `drift_guard`.

The dispatcher only iterates subscription rows:

```155:183:src/proactive/dispatcher.ts
      const subs = await listEnabledSubscriptions(target.userProfileId);
      const customDue = dueCustomByUser.get(target.userProfileId) ?? [];
```

Rhythm kinds are seeded by exactly one caller — the provisioning script:

```132:146:src/proactive/subscriptions/store.ts
/** Enable default rhythm catalog subscriptions for a newly provisioned owner. */
export async function seedDefaultRhythmSubscriptions(
  userProfileId: string,
  deps?: { client?: SupabaseClient },
): Promise<void> {
```

The owner profile was created **2026-08-02**, before that seeding existed, and there is **no backfill
migration and no boot-time reconciliation**. So the entire "logging" focus area — one of the five
things minimal mode exists to perfect — is dark, and nothing in the code reports that it is dark.

`evening_log_followup` is a companion kind gated on the parent subscription being enabled
(`dispatcher.ts:189`), so it is dark for the same reason. `activity_completion` never fired because
the event log has almost no `planned` rows to close (see §4).

### Consequence: the morning question is rhetorical

The brief asks *"What's the one thing that makes today a win?"* every single day — 35 times. There
is no capture: `magnus_daily_logs` has **zero rows since 2026-08-18** (25 days), and the `checkins`
list has **3 items total, last on 2026-08-19**.

Magnus asked the same question 24 mornings in a row, received no answer, and never once noticed,
followed up, or changed the ask. An assistant that cannot tell whether you replied is not present.

---

## 2. Reminders — the single most trust-destroying path

Reminders are a Phase 1 focus area. The real timeline for one reminder:

| Date | Event |
|---|---|
| 2026-08-15 | User asks for a water reminder **every 2 days**. Magnus: *"I've set up reminders for you every 2 days until Aug…"* |
| 2026-08-16 → 08-17 | Fires **daily**, not every 2 days |
| 2026-08-17 03:38 | Magnus *"locks in"* more coriander reminders — 2 rows created 3 seconds apart |
| 2026-08-18 | Fires **3×** in one morning (03:30:08, 03:30:09, 03:30:10) |
| **2026-08-20 03:42** | User: **"Cancel reminders for coriander water change"** → Magnus: *"I can see your reminders, but the labels aren't displaying…"* — **cancel failed** |
| 2026-08-21 → 08-27 | Fires **2×/day for 7 more days** after the cancel request |
| 2026-09-11, 09-12 | Resurfaces, **2×/day** |
| **2026-09-12 03:31** | User: **"Stop the water corriander reminder"** → **no assistant reply was ever persisted** |

Three separate defects compound here:

1. **No interval schedule.** `createRecurringCustomReminder` only supports daily
   (`recurring_local`) or weekly (`weekly_local`) — there is no "every N days" and no `until` date
   (`src/proactive/subscriptions/store.ts:176-252`). "Every 2 days until Aug 30" is therefore
   unrepresentable, so it was stored as **daily, forever**.
2. **Corrections stack instead of replace.** Two identical rows created 3 seconds apart both fire, so
   the user gets the same message twice, ~1 second apart. `updateCustomReminder` explicitly refuses
   to retime a recurring reminder (`store.ts:284-289`), so the model's only move is to create another.
3. **Cancel does not work by description.** `matchRemindersByQuery` matches on `row.title`, which for
   a standalone reminder is `config.message` — the emoji-laden body, not a label
   (`src/proactive/reminderStore.ts:38-42, 170-183`). "Cancel reminders for coriander water change"
   does not token-match `"💧 Change the water in your coriander plant!"` reliably, and the reply the
   user got (*"the labels aren't displaying"*) is Magnus describing its own broken data model to the user.

This is already logged as **B-001 in the hardening log**, scoped to PR #99 (still `pending`). It has
been live for 28 days. It is the clearest possible signal of "not a live assistant": the user told it
to stop, twice, three weeks apart, and it did not stop.

### Stale reminders still arrive in a batch

Four one-shot reminders due 2026-09-06 13:30, 09-07 15:30, and 09-07 11:30 (×2) were **all delivered
in a single burst at 2026-09-10 03:45:00** — days late, at 09:15 local, one second apart:
`Evening gym reminder`, `Time to build Magnus`, `Call mom`, `Call mom`. PR #105 added a 24h expiry
window after this happened, but the delivery burst itself (all due reminders fired in one dispatcher
tick with no grouping and no "this was due 3 days ago" framing) is unchanged.

---

## 3. Three of five focus areas silently drop writes

Traced from real turns on 2026-09-11.

### 3a. Logging — journal entry lost, and the reply contradicts itself

User: *"Also note a journal entry that yesterday was a really great day… i finally did backfloating
and landing"*

Reply, verbatim: *"**I haven't actually saved that yet.** That's awesome! 🎉 … **I've logged that
yesterday was a great day for you.** … Tell me again in one message what to log or add and I'll
handle it."*

One message that says both "I didn't save it" and "I logged it". Nothing reached `magnus_daily_logs`.

Root cause chain:

1. The message mixes "note a journal entry" with a swimming narrative. The minimal classifier has no
   rule that logging verbs belong to GENERAL, and swimming reads as HEALTH
   (`src/agents/orchestratorIntent.ts:85-97`) → routed `HealthComposite`.
2. `journal` is in the health catalog (`healthCatalog.ts:104-107`) but **filtered out of the parser's
   view** in minimal mode, since `MINIMAL_HEALTH_CAPABILITIES = {fitness, hevy_write, generic_ack}`
   (`minimalMode.ts:46`, `filterCapabilityCatalog` at `minimalMode.ts:154-183`).
3. The plan therefore lands on `fitness`, which is a **prompt-only agent with zero tools**
   (`fitnessAgent.ts:170-211`). No health executor can reach `log_note` at all.
4. `enforceActionIntegrity` correctly detects the false save claim and prepends the honest prefix
   (`actionIntegrity.ts:403-407`) — but the composer's own "I've logged that" survives inside the
   body, so the user reads a contradiction.

The guard is doing its job. The problem is that **the write path does not exist on the route the
message took**, and the honest-failure UX ("tell me again in one message") pushes the work back onto
the user.

### 3b. Lists — 13-item todo list lost, failure euphemised

User asked for a 3-day holiday todo list with 13 items. Reply: *"There's a **backend hiccup**
preventing me from saving it to your tasks tool right now, but here's everything organized…"*

`tasks` list last received an item on **2026-08-11**. Nothing was saved.

- **"backend hiccup" does not exist anywhere in the codebase** — the model invented it to paper over a
  tool failure, directly violating the honesty rule in `magnusCorePrompt.ts:137-139`. Because the
  reply *admits* failure, `enforceActionIntegrity` does not intervene (`actionIntegrity.ts:344-372`),
  so the euphemism ships as-is and the user cannot tell what went wrong or how to retry.
- **`add_list_item` is one item per call** (`magnusAgent.ts:619-638`, `listService.ts:345-404`). There
  is no batch API, so 13 items needs 13 calls against `MAGNUS_MAX_TOOL_ROUNDS = 12`
  (`magnusAgent.ts:83-86`).
- **`"todo list"` does not resolve.** Aliases cover `todo` and `todos` but not `todo list`, which
  normalizes to the non-existent slug `todo-list` (`src/lists/listSlug.ts:22-24, 39-48`) and returns
  `Unknown list "todo list"`.

Lists are the easiest of the five focus areas and the highest-volume real ask, and the exact phrasing
a human uses ("create a todo list") is the phrasing that fails.

### 3c. Workouts — Hevy routine creation refused, despite being implemented

User: *"Create new routine for me, with a 3-2-2 exercise split… Create and add to hevy"*

Reply: *"I don't have direct access to your Hevy account to create and add routines for you"* —
followed by generic textbook exercises (Bench Press, Barbell Rows, Squats).

Both halves are false:

- `createHevyRoutine` (`POST /v1/routines`) **is implemented** and wired end to end
  (`hevyClient.ts:226-249`, `hevyWriteAgent.ts:289-333`), and `hevy_write` **is allowed in minimal
  mode** (`minimalMode.ts:46`). The only blocker is that `parseHevyWriteCommand` requires the literal
  prefix `hevy routine:` (`parseHevyWriteCommand.ts:61-66`), so natural language never reaches it.
- The user's locked `weekly_schedule` program memory **was in context** (`healthRouter.ts:36-41` →
  `loadHealthReferences.ts:99-109`, injected at `fitnessAgent.ts:175-193`). The model ignored it and
  produced a generic split.

So Magnus denied a capability it has, while sitting on the user's real programme. Nothing in the
non-consultation compose path strips capability denials — that rule only exists for
`pillar_consultation` (`composePillarPlanReply.ts:143-144`).

---

## 4. Nothing to close, so nothing gets closed

`magnus_events` over 42 days: **51 `done`, 6 `missed`, 1 `planned`, 1 `partial`, 1 `cancelled`,
1 `preponed`** — and the single `planned` row is dated 2027-01-31.

`activity_completion` nudges fire off `planned`/`in_progress` rows past their end time
(`activityCompletionJob.ts`). With essentially no forward `planned` rows, the job has nothing to act
on, which is why it has fired **0 times**. Only 3 `event_reminder` sends ever happened, none since
2026-08-14, for the same reason: `remind_at` is almost never set.

Magnus is recording history (`done` after the fact, largely via `gym_hevy_reconcile`) but not holding
commitments. Without forward `planned` rows the adherence question minimal mode exists to answer has
no inputs — the growth snapshot's `slippingRoutines` and the day rhythm scorecard are computing over
an empty set.

---

## 5. It does not notice its own mess

The 2026-09-12 morning brief listed:

```
- 09:00–09:50 — Swimming @ Cult HSR
- 10:00–10:50 — Morning Swimming
```

Two overlapping swim sessions, presented flatly as fact. No dedupe, no "these look like the same
session, which is real?". `buildDayContext` formats calendar and event rows without conflict
detection, so duplicated or contradictory entries are read out verbatim every morning.

The same day, the coriander reminder arrived twice in two seconds, and the brief that morning made no
reference to the fact that the previous 24 mornings' win questions went unanswered.

---

## 6. Silent hard failure

2026-09-12 03:31:48 — user: *"Stop the water corriander reminder"*. **No assistant row exists for
that turn.** The user got nothing back: not a confirmation, not an error, not the 4-minute timeout
fallback.

`MAGNUS_TURN_TIMEOUT_MS` defaults to **240 000 ms** (`magnus.ts:42-48`) and a simple turn is
3 Haiku + 1–2 Sonnet calls **strictly sequential** (routing context parser → intent classifier → plan
parser → tool loop → composer). A four-minute budget for "stop this reminder" plus a path where the
reply can be lost entirely is, from the user's seat, indistinguishable from the bot being dead.

Message volume tells the story: Aug 2–22 averaged roughly 20 user messages/day; Sep 7–12 was
`2, 43, 11, 0, 0, 0, 6, 1`. The two highest-effort asks in that window (13-item todo list, Hevy
routine) both failed, and the last message in the log is a cancel request that got no answer.

---

## 7. Minimal mode's own configuration fights Phase 1

Findings from the config audit, independent of the data:

| # | Finding | Symptom |
|---|---|---|
| 1 | **Every photo is hard-blocked** at orchestrator entry (`magnusOrchestrator.ts:85-102`) before vision runs | "Photo / vision is temporarily parked" — kills list-from-photo, which is a Phase 1 lists flow |
| 2 | `lifeos` capability parked while `log_daily_checkin` / `get_daily_checkin` are allowlisted (`minimalMode.ts:76-77` vs `executeGeneralPlanStep.ts:25-35`) | Chat-initiated check-in outside the FSM returns "LifeOS logging is temporarily parked" |
| 3 | `manage_proactive_messages` excluded from the tool allowlist and `proactive` capability parked | The user **cannot enable the evening journal from chat** — the one action that would fix §1 |
| 4 | `journal_note` is live in `MINIMAL_GENERAL_CAPABILITIES` (`minimalMode.ts:41`) but `MINIMAL_MODE_SYSTEM` tells the model not to offer journal notes (`magnusCorePrompt.ts:159-161`) | Model refuses a feature that works |
| 5 | Health executor labels **every** non-minimal capability as "Meals & nutrition" parked (`executeHealthPlanStep.ts:52-54`) | Sleep/recovery/programming asks get a wrong-feature parked message |
| 6 | Parked reply leaks host config: *"Set `MAGNUS_MINIMAL_MODE=false` on the host to restore full Magnus"* (`minimalMode.ts:208-214`) | User is shown an env var |
| 7 | Parked pillars gate on the parser's `parked_feature_topic`, not intent | Wealth/happiness/leisure asks sometimes get full coaching, sometimes a canned park — inconsistent |

Item 3 is the deadlock: logging is dark because no subscription exists, and the tool that would
create one is excluded from minimal mode.

---

## Phase 1 scorecard

| Area | State | Evidence |
|---|---|---|
| **Calendar** | Works | Briefs read real events daily; no conflict detection (§5) |
| **Workouts** | Partial | `gym_hevy_reconcile` works (6 sends, correct). Routine creation refused despite being built (§3c) |
| **Lists** | Broken for real phrasing | `todo list` slug fails, no batch add, failures euphemised (§3b); photos blocked (§7.1) |
| **Reminders** | Actively harmful | No interval/until, corrections duplicate, cancel broken, silent failure (§2) |
| **Logging** | Never ran | 0 evening journals, 0 activity-completion nudges, 0 daily logs in 25 days (§1) |

Two of five work, one is partial, one is broken, one has never run.

---

## Fix plan, in dependency order

### P0 — restore the loop (without this, nothing else matters)

1. **Backfill rhythm subscriptions.** Migration + boot-time reconciliation that ensures every
   allowlisted profile has `RHYTHM_DEFAULT_ENABLED_KINDS` rows. Seeding must not live only in
   `provision-owner-user.mts`.
2. **Un-park proactive management.** Add `manage_proactive_messages` to `MINIMAL_MAGNUS_TOOL_NAMES`
   and `proactive` to `MINIMAL_GENERAL_CAPABILITIES` so the user can turn rhythms on and off in chat.
3. **Close the morning-intention loop.** If the win question goes unanswered N days running, stop
   asking it that way and say so. A capture rate of 0/24 must surface somewhere.

### P0 — stop the reminder harm (B-001, segment 10.3)

4. **Interval + until schedules:** `recurring_interval` (every N days) with an `until` date.
5. **Replace-on-correct:** a correction to an existing reminder updates that row; never create a
   second row with the same message for the same user.
6. **Cancel by description:** match on a stored label/topic, not the emoji message body; on ambiguity
   list candidates and ask — never reply "the labels aren't displaying".
7. **Dedupe at send time:** identical `(user, message, dateKey)` sends collapse to one.
8. **Late delivery framing:** group a due backlog into one message and say when each was due.

### P1 — make the five areas actually complete a write

9. **Route logging verbs to GENERAL.** "note / log / journal" wins over topical HEALTH content in the
   minimal classifier; or bridge `log_note` into the health path.
10. **Batch list add** (`add_list_items` with an array) plus `todo list` → `tasks` alias.
11. **Natural-language Hevy routine creation** — drop the `hevy routine:` prefix requirement, and
    forbid the fitness prompt from claiming no Hevy access.
12. **Never euphemise a tool failure.** When `tool_outcomes` contain failures, emit deterministic
    text naming what failed and the retry, instead of letting the model paraphrase.
13. **No self-contradicting replies.** When action integrity prepends "I haven't actually saved
    that yet", strip persistence claims from the body (extend `stripMisleadingClaimLines`).

### P1 — make it feel present

14. **Set `remind_at` and `planned` rows by default** when a commitment is accepted, so
    `activity_completion` and `event_reminder` have inputs.
15. **Calendar conflict detection** in `buildDayContext` — flag overlapping/duplicate sessions and
    ask, rather than reading both out.
16. **Never lose a turn.** Guarantee an assistant row per user turn; drop the default turn budget
    well below 240s for tool-light turns.
17. **Clean the parked copy** — remove the env-var instruction, fix the "Meals & nutrition" mislabel,
    and reconcile `MINIMAL_MODE_SYSTEM` with what is actually enabled.

### P2 — cadence

18. **Reconsider which rhythm kinds are parked.** `midday_encouragement`, `chat_inactivity`,
    `stale_list_nudge`, `week_planning` and `weekly_wrap` are all excluded, leaving morning brief +
    evening journal. `chat_inactivity` in particular would have caught the Sep 7–10 silence.
19. **Unblock photos for non-meal purposes** — vision already infers purpose; park only `meal_log`.

---

## The one-line diagnosis

Minimal mode built the **capture** half of the loop and shipped it without the **closure** half, then
fenced off the tool that could turn closure on. What remains is a 07:00 broadcast that cannot be
corrected, cannot be stopped, and never asks how yesterday went.
