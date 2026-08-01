# The commitment log (`magnus_events`)

The master table. One row per thing Saksham said he would do — what it was, which pillar it
belongs to, when he planned it, when it actually happened, and how it ended.

Everything else Magnus knows about his days is derived from somewhere else: the calendar holds
bookings, `magnus_daily_logs` holds reflection, Hevy holds workouts. This table holds **intent and
outcome**, which is the pair you need to answer "do I actually do the things I say I will".

- Schema: `supabase/migrations/20260801120000_magnus_events.sql`
- Self-test: `supabase/tests/magnus_events_test.sql`
- Data layer: `src/events/eventsStore.ts`, types in `src/events/types.ts`
- Tools Magnus calls: `src/agents/tools/eventTool.ts`
- Live check: `npm run test:events`

---

## Applying it

The project has no migration runner; migrations are applied by hand.

1. Open the Supabase SQL editor for project `xdrpjfdhduskhzryevze`.
2. Paste `supabase/migrations/20260801120000_magnus_events.sql` and run it. It is idempotent, so
   re-running is safe.
3. Run `npm run test:events` with real service-role credentials. It plans an event, moves it,
   finishes it, reads the stats back, and deletes what it made.

To check the schema itself without touching production:

```bash
createdb magnus_test
psql -d magnus_test -v ON_ERROR_STOP=1 \
  -f supabase/tests/magnus_events_test.sql \
  -f supabase/migrations/20260801120000_magnus_events.sql \
  -c 'SELECT public.magnus_events_selftest();'
```

The test file creates stand-ins for `auth.role()`, `user_profile` and `magnus_daily_logs`, then
asserts the behaviour the application depends on. Any failure aborts.

---

## The one idea that shapes everything

**Moving something is not editing it.** If the 21:00 AI session becomes a 23:00 AI session, the
21:00 row stays exactly as it was and closes with status `postponed`. A new row carries 23:00.
The two are linked in both directions, and both share `root_event_id`.

```
root_event_id = A
┌──────────────────────┐      ┌──────────────────────┐      ┌──────────────────────┐
│ A  21:00  postponed  │─────▶│ B  23:00  preponed   │─────▶│ C  22:00  done       │
│    is_latest = false │◀─────│    count = 1         │◀─────│    count = 2         │
└──────────────────────┘      └──────────────────────┘      └──────────────────────┘
```

`C.original_planned_start_at` still says 21:00, so total drift is one column, and
`SELECT … WHERE root_event_id = A` is the whole story of that commitment.

Use `magnus_reschedule_event()` (or `rescheduleMagnusEvent`) for a move. Use a plain `UPDATE` only
to correct a mistake — a time typed wrong, a better title. The distinction is the whole point: one
is data about his behaviour, the other is a typo.

---

## Statuses

| Status | Meaning |
|---|---|
| `planned` | Committed to, not started |
| `in_progress` | Started (stamps `started_at` if the caller did not) |
| `done` | Finished (stamps `completed_at`) |
| `partial` | Started and counted, but not finished as intended |
| `skipped` | Deliberately not done — a decision |
| `missed` | The time passed and nothing happened — not a decision |
| `cancelled` | Dropped entirely, with no replacement |
| `postponed` | Moved later; a successor row holds the new time |
| `preponed` | Moved earlier; a successor row holds the new time |

`postponed` and `preponed` are written by the database, never by the application. Anything else can
be set directly. `skipped` and `missed` are kept apart on purpose: choosing not to train is a
different signal from forgetting to.

Every change appends to `status_history` (last 50), so the trail survives even when the current
status does not tell the story.

---

## Columns worth knowing

**Derived for you.** `activity_key` (slug of the title, the grouping key for "how often do I
actually do this"), `planned_local_date` / `planned_local_time` / `planned_local_dow` (computed
from `planned_start_at` in the row's own `time_zone`), `planned_duration_minutes`,
`actual_duration_minutes`, `start_delay_minutes` (signed — negative means early), `is_latest`,
`root_event_id`.

**Links out.** `calendar_event_id` ties a row to its Google Calendar booking (at most one *open*
row per calendar event; closed rows keep the id because Google reuses it when an event moves).
`daily_log_id` ties it to the journal entry that reflects on it. `displaced_by_event_id` records
what took its slot when something else pushed it out.

**Nudging.** `reminder_at` / `reminder_sent_at`, with a partial index over exactly the rows a
reminder job would scan. Reschedules carry the reminder's lead time across.

**Safety.** `deleted_at` is a soft delete, so removing one row never orphans a chain.

---

## Guards in the schema

Things the database refuses, so the application never has to remember them:

- A chain cannot fork, loop, cross users, or supersede a row twice.
- A superseded row cannot keep an open status.
- An event cannot end before it starts (planned or actual).
- The same open title cannot be logged twice at the same minute.
- `user_profile_id` cannot change.
- An unknown IANA zone falls back to UTC and records the bad value in `metadata` rather than
  failing the write — losing a log line matters more than a perfect zone.

`describeEventError` in the store turns these constraint names back into English, so a refusal
reaches the user as a sentence rather than a Postgres string.

---

## Reading behaviour, not rows

`magnus_activity_stats` aggregates per `activity_key`: how often something was planned, done,
missed, skipped or moved; the hour it usually sits at; how late it typically starts; how long it
actually takes; average rating. Magnus reads it through the `activity_stats` tool, so the model
gets a handful of lines instead of a table dump.

`magnus_mark_missed_events(user, grace)` closes out plans whose time has passed. The morning brief
calls it before reading the day, so "missed" is recorded rather than inferred from a stale
`planned` row. All-day events get until the end of the day; deliberate `skipped` is left alone.

---

## What Magnus does with it

| Tool | Use |
|---|---|
| `log_event` | A commitment ("AI session at 9"), or something already done |
| `read_events` | The day, a range, a pillar, or one activity by name |
| `set_event_status` | How something ended, with a note in his words |
| `reschedule_event` | A move — records the slip instead of hiding it |
| `activity_stats` | Pattern rather than a single day |
| `drop_event` | Something logged by mistake |

For a real time block, Magnus books the calendar *and* logs the event, passing the calendar id so
the two stay together. The morning brief reads today's commitments and the last week's slips.

---

## Not wired yet

- **Reminders are stored, not sent.** `reminder_at` is indexed and maintained across reschedules,
  but no job reads it.
- **The journal link is manual.** `daily_log_id` exists and the store writes it when told to;
  nothing yet infers "this note is about that event".
- **`goal_id` is a plain column.** `goals` is not in this repo's migrations, so there is no foreign
  key to it.
