# Magnus coach chat: architecture

The coach chat is how a person logs their health and gets coached; everything else in the app
reads what the chat writes. This document says how a turn works, what the model sees, how state
stays honest, and how we know it is working. It describes the code as of the production-grade
chat series (PRs after #139); file names are in `src/healthApp/`.

## One turn

```
PWA  ──POST /chat/stream {text, turnId}──▶  router.ts  ──▶  chat.ts runHealthChat
                                                              │ beginTurn: claim the turn id
                                                              │ answerTurn: model loop
                                                              │   load snapshot + details + memory (parallel)
                                                              │   system = [SYSTEM_PROMPT (cached), context block]
                                                              │   rounds: model → tool calls → results → model
                                                              │   stream text deltas and tool progress as SSE
                                                              │ save assistant row, mark user row ok
                                                              └ logTurn: one chat_turn event row
```

- **Turn ids and idempotency** (`beginTurn`). The client sends a UUID per message. The user row is
  inserted with `status = pending`; a repeat of the same id replays the stored reply, or answers
  `409 in_progress` while the first attempt still runs (150 s). A failed turn is marked `failed`
  and shown with a Retry; the model never sees failed or pending user rows (`completedTurns`).
- **Budgets** (`TURN_BUDGET`): 70 s wall, 40 s per model call, 45 s per tool, 6 rounds, 4096
  output tokens. Past any of them the coach says what it managed and stops, instead of the client
  timing out first. Overridable with `MAGNUS_CHAT_WALL_MS` etc.
- **Streaming**: `POST /chat/stream` sends `progress` (what tool is running, in words), `delta`
  (text), `done` (the full reply with cards) and `error` events; a keepalive comment every 5 s. The
  client falls back to `POST /chat` without a readable body. The Anthropic SDK stream is used
  with `finalMessage()`, so tool use works the same way in both paths.
- **Routing**: short logging messages go to the fast model (Haiku), anything that reads like a
  slip, a state or a question to the main model (Sonnet). If the fast model dodges a loggable
  message (no tool) or reaches for a coaching tool, the round is redone on the main model
  (`stats.escalated`). Routing is a regex; `chatRouting` tests pin the cases that used to leak.
- **Tool failures** return a JSON result with `reason` and `tellThePerson`, so the model can say
  "I couldn't save that, try again" rather than guessing or saying "done".

## What the model sees

System prompt (`chatPrompt.ts`, one cached block) + a per-turn context block built from one
`HealthSnapshot`:

```
Now: 2026-11-03T08:00:00Z (Asia/Kolkata, local date 2026-11-03). Phase: steady.
About them: male, born 1996, 178 cm, vegetarian, avoids peanuts, goal type: weight.
Remembered about them (they see and edit this list on the You tab): Travels Mon-Wed most weeks; ...
Goal: Weight 81.9kg → 74kg (on pace); deadline 2027-01-31, 89 days left.
Targets: 1800 kcal, protein 120 g, 8000 steps, training days 1,3,5 (0=Sun).
Today: 610 kcal eaten (1190 left), 28 g protein, 4200 steps, 1 meal logged, training day.
Routine today: Morning walk done (Walking · 30 min); Gym pending (6:30 pm).
This week: 3 of the last 7 days on track (goal 5); most missed: Protein (4 days).
Last weigh-in: 81.9 kg on 2026-11-02, 22.8% body fat.
Open check-ins: gym on 2026-11-01.
Last Hevy workout: Push day on 2026-11-01.
```

- **Phases** (`chatPhase`): no_goal, first_week, steady, off_track, deadline_passed. The prompt
  says what each one means for the reply.
- **History** (`historyToMessages`): the last completed turns, each assistant message followed by
  bracketed notes giving every past card's state from the database (`chatCards.ts`:
  `loadCardStates` + `cardHistoryNote`). Consecutive same-role rows are merged. App-posted rows
  (check-ins, with `turn_id` null) are prefixed `[Posted by the app on its own...]` so the model
  knows the person has not seen a question answered.
- **get_status** is answered from the same snapshot that built the context block, so numbers
  never disagree within a turn.
- **Coach memory** (`coachMemory.ts`): up to 30 lines of 200 characters the coach adds with the
  `remember` tool and drops with `forget`. The list goes into every context block and is shown,
  editable, on the You tab. Nothing is remembered that the person cannot read.
- **Legacy switch**: `MAGNUS_CHAT_PROMPT=legacy` restores the previous prompt and one-line context.

## State honesty

Cards are the contract between model, server and client. A tool that proposes something returns
a card (`meal_draft`, `activity_draft`, `hevy_proposal`, `rca`, `calorie_review`, `routine_check`,
`workout_check`); nothing is logged until the person acts on it. Rules the code enforces, so the
prompt need not:

- A fixed line under a draft card ("check the card, then tap Confirm & log").
- The phantom-card guard: a reply that mentions a card no tool showed in this turn is rewritten.
- `hydrateCard` on every history read: the client always shows a card's real state (saved,
  applied, answered), and the model's notes say the same.
- Check-ins (`coachInbox.ts`): one unanswered message per routine item; a new date joins it
  ("nothing logged for Sun 1 Nov and Mon 2 Nov"), and past three unanswered app messages new ones
  fold into the latest as a catch-up line. Each date keeps its own answerable card.

## Observability and cost

Every turn writes a `chat_turn` row to `health_app_events`: turn id, outcome (ok / budget / error),
models used, rounds, each tool with its duration and ok flag, tokens (input, output, cache read,
cache write), cards shown, whether anything changed, whether the guard fired, wall time. The query
in PR #140's description gives daily p95 latency, token totals and error counts.

Cost levers, in order: the cached system prompt and tool schema (a cache marker on the last tool
caches the whole prefix), fast-model routing for plain logs, the 6-round and 4096-token budgets,
and the context block replacing most `get_status` calls.

## Evals

`src/healthApp/evals/` holds 105 cases scored in code: logging (the right tool with the right
arguments, first try), coaching (numbers, one suggestion, diet respected, memory used),
state_honesty (never claims a log, never points at an old card), failure (a tool throws, the coach
says so), safety. `npm run evals` runs them against the real model with a fixture person and
stubbed tools; bars are logging 95%, coaching 90%, state honesty 100%, failure 90%, safety 100%.
The nightly workflow `chat-evals.yml` needs the `ANTHROPIC_API_KEY` repository secret. A prompt
change ships only with a run at or above the bars pasted into its PR.

## Deploy and rollback

Railway deploys `main`. Migrations are additive and applied to the `magnus-ai` Supabase project
before the PR merges, so the running code is never ahead of the schema. Rolling back a chat PR is
a revert; columns and tables stay (defaults keep them inert). Env switches: `MAGNUS_CHAT_PROMPT=legacy`,
`MAGNUS_HEALTH_CHAT_ROUTING=off` (everything on the main model), `MAGNUS_CHAT_WALL_MS` and friends.
