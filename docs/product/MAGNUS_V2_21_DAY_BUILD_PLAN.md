# MAGNUS — 21-DAY CLEAN-ROOM MVP BUILD PLAN

## 0. Mission

Build Magnus from scratch as an **adaptive personal intelligence system**.

Magnus is not:

- a task manager
- a habit tracker
- a journal
- a calendar
- a goal dashboard
- an AI chatbot with memory
- a collection of mini-agents
- a LifeOS with 25 modules

Magnus exists to maintain the control loop between:

**Intent → Strategy → Action → Reality → Observation → Diagnosis → Adaptation**

The MVP lives entirely inside **Telegram**.

No dedicated UI should be built during these 21 days.

The purpose of the Telegram MVP is to prove the underlying intelligence and state-management architecture before visual/product UI decisions become expensive.

---

# 1. Product Promise

Magnus should continuously help the user answer four questions:

1. **What do I want?**
2. **Where do I stand?**
3. **What should I do next?**
4. **Given what has happened, should anything change?**

Everything built during these 21 days must improve one of those four questions.

If a proposed feature does not materially improve one of those four questions, do not build it.

---

# 2. Primary User

Initial user:

**One ambitious knowledge worker managing multiple simultaneous goals across health, career, wealth, relationships, learning and personal projects.**

The MVP may be single-user.

Do not prematurely generalize the product.

Architecture should not deliberately prevent future multi-user support, but do not spend time on:

- teams
- organizations
- enterprise auth
- RBAC
- sharing
- collaboration

---

# 3. Core Product Philosophy

Magnus is the **system of intelligence**, not the system of record.

Existing tools eventually remain the sources of truth for:

- calendar
- workouts
- financial transactions
- emails
- tasks
- sleep
- health data
- work messages

Magnus should eventually consume those sources.

For the 21-day MVP, most evidence can be supplied manually through natural-language Telegram messages.

Example:

> Gym done. Felt unusually tired.

Magnus should understand that as:

- action/routine completed
- energy observation recorded
- potentially relevant evidence for health state

The user should not need to fill three forms.

---

# 4. Core Intelligence Model

Magnus must explicitly represent:

## Desired State

What outcome or condition is the user trying to reach or maintain?

Example:

> Reach 90 kg by July 2027.

---

## Current State

Where does the user stand today?

Example:

> Weight = 112 kg.

---

## Strategy

What hypothesis has been chosen to move from current state to desired state?

Example:

> Moderate calorie deficit + 4 strength sessions/week + daily walking.

A strategy is not a task.

It is the causal hypothesis connecting actions to outcomes.

---

## Leading Indicators

Things expected to predict movement.

Examples:

- gym adherence
- steps
- diet adherence
- interview practice hours
- savings rate
- applications sent

---

## Outcome Indicators

Measures of actual movement toward the desired state.

Examples:

- rolling body weight
- net worth
- interview performance
- job offers
- relationship satisfaction
- business revenue

---

## Evidence

Observed facts.

Evidence may come from:

- user messages
- integrations
- measurements
- completed actions
- reflections
- external APIs

Evidence must include:

- source
- timestamp
- confidence
- associated goal/area if known

---

## Trajectory

Magnus must compare:

**expected movement**

against

**observed movement**

and classify trajectory.

Possible state:

- ON_TRACK
- AHEAD
- AT_RISK
- OFF_TRACK
- UNKNOWN

---

## Diagnosis

When reality diverges from intent, Magnus must distinguish among:

### Execution failure

The plan is reasonable, but the user is not doing it.

### Routine failure

The required behavior repeatedly fails because the routine/system is poorly designed.

### Strategy failure

The user is executing sufficiently, but outcomes are not responding.

### Goal failure

The goal may be unrealistic, irrelevant, conflicting or no longer desired.

### Information failure

There is insufficient evidence to diagnose responsibly.

This taxonomy is one of the most important parts of Magnus.

Never collapse everything into:

> “You need to be more consistent.”

---

# 5. Types of Life Objects

Do not turn everything into a goal.

Magnus must distinguish:

## Outcome

Something expected to change toward a measurable state.

Example:

> Reach 90 kg.

---

## Standard

Something that should remain true.

Example:

> Maintain a healthy marriage.

There is no completion state.

---

## Project

A bounded temporary effort.

Example:

> Plan Thailand trip.

---

## Exploration

A question the user is trying to resolve.

Example:

> Do I actually want to become a PM?

Success means learning enough to make a decision.

---

# 6. Core UX Surfaces

Telegram only.

Expected commands eventually include:

`/start`

`/now`

`/today`

`/status`

`/review`

`/weekly`

`/goals`

`/help`

But ordinary conversation should handle most use cases.

Examples:

> Add losing 20 kg as an important goal.

> I changed my mind. MBA is not important anymore.

> Gym done.

> I spent three hours preparing for the interview.

> I am really struggling to follow my diet on weekends.

> What should I do now?

> How am I doing overall?

> Is my health strategy working?

---

# 7. Product Non-Goals During These 21 Days

Do NOT build:

- mobile app
- web dashboard
- visual charts
- finance tracking module
- calorie tracker
- workout tracker
- journaling product
- Pomodoro timer
- streak system
- XP
- gamification
- avatars
- robot companion
- social feed
- recommendations marketplace
- full calendar replacement
- full task manager
- Slack agent
- email agent
- Zerodha integration
- Hevy integration
- Notion integration
- wearable integration
- multi-agent architecture unless proven necessary

Do not add something merely because PLOS or another LifeOS has it.

---

# 8. Engineering Principles

## Clean-room repository

Create a completely new repository.

Suggested name:

`magnus-core`

Do not copy legacy source files.

The old repository may be inspected only for:

- credentials that need rotation
- deployment configuration
- Telegram bot identity
- lessons about previous failures

No domain model or architecture should be inherited by default.

---

## Recommended stack

Backend:

- Python 3.12+
- FastAPI
- PostgreSQL
- SQLAlchemy 2.x
- Alembic
- Pydantic
- python-telegram-bot or aiogram
- pytest

LLM:

Create an internal provider abstraction.

Do not tightly couple core logic to one model/provider.

Interface approximately:

`LLMProvider.generate()`

`LLMProvider.extract_structured()`

`LLMProvider.reason()`

The business logic must remain testable without live LLM calls.

---

## Architecture

Suggested modules:

```text
magnus/
    api/
    telegram/
    domain/
    application/
    intelligence/
    repositories/
    infrastructure/
    prompts/
    evaluations/
    jobs/
    tests/
```

Prefer explicit domain services over a giant agent prompt.

The LLM should help Magnus reason.

It should not secretly become the entire application.

---

# DAY 1 — PRODUCT CONTRACT + CLEAN REPOSITORY

## Objective

Create a completely clean project foundation and encode the product philosophy before implementation begins.

Do not build intelligence today.

### Tasks

1. Create new repository.
2. Add README.
3. Add architecture decision record folder.
4. Create `PRODUCT_CONTRACT.md`.
5. Add Python environment.
6. Add formatting/linting/testing.
7. Create application skeleton.
8. Configure `.env.example`.
9. Configure PostgreSQL locally.
10. Add basic FastAPI health endpoint.
11. Create Telegram bot skeleton capable of receiving and replying to `/start`.

### PRODUCT_CONTRACT.md must contain

- problem statement
- four Magnus questions
- intelligence loop
- diagnostic hierarchy
- explicit non-goals
- principle: intelligence layer, not database
- principle: minimize user maintenance
- principle: no advice without adequate evidence
- principle: distinguish observations from inference
- principle: goal != strategy != routine != action

### Acceptance criteria

- application starts locally
- database connects
- `/health` returns success
- Telegram `/start` receives response
- tests run successfully
- no legacy code exists inside repo
- README explains local setup

### Day 1 Cursor prompt

Build Day 1 of Magnus according to this document.

Do not implement goal tracking or AI logic yet.

Create the clean repository architecture, development environment, FastAPI server, database connection, Telegram adapter and PRODUCT_CONTRACT.md.

Before finishing, generate:
1. architecture tree
2. setup instructions
3. test instructions
4. explanation of every dependency introduced

Avoid unnecessary dependencies.

---

# DAY 2 — DOMAIN MODEL

## Objective

Represent Magnus's conceptual world correctly.

Today is one of the most important days.

Bad data modelling here will infect everything later.

### Implement entities

User

LifeArea

LifeObject

LifeObject types:

- OUTCOME
- STANDARD
- PROJECT
- EXPLORATION

DesiredState

CurrentState

Strategy

Indicator

Indicator types:

- LEADING
- OUTCOME

Evidence

Action

Routine

StateSnapshot

### Important relationships

A LifeObject belongs to a LifeArea.

A LifeObject may have:

- desired state
- current state
- active strategy
- indicators
- actions
- routines
- evidence

Strategies must be versioned.

Never overwrite strategy history.

### Every important object should have

- id
- created_at
- updated_at
- status
- provenance/source where useful

### Tests

Build domain-level tests for:

1. creating an outcome
2. attaching desired/current states
3. attaching a strategy
4. attaching indicators
5. attaching evidence
6. changing strategies while preserving previous version
7. archiving a goal
8. creating a standard
9. creating an exploration

### Acceptance criteria

It must be possible to represent:

> Goal: 90 kg by July 2027  
> Current weight: 112 kg  
> Strategy: calorie deficit + strength training + walking  
> Outcome metric: weight  
> Leading indicators: gym, steps, diet

without using arbitrary JSON blobs for everything.

---

# DAY 3 — EVENT LEDGER + STATE HISTORY

## Objective

Magnus must understand history.

Do not build only current state tables.

The intelligence depends on knowing:

> what was true before?

### Implement Event

Every meaningful state change produces an event.

Examples:

`GOAL_CREATED`

`GOAL_CHANGED`

`GOAL_ARCHIVED`

`EVIDENCE_RECORDED`

`ACTION_COMPLETED`

`ROUTINE_COMPLETED`

`STRATEGY_CHANGED`

`CURRENT_STATE_UPDATED`

`REVIEW_COMPLETED`

`DIAGNOSIS_CREATED`

### Event fields

- id
- user_id
- event_type
- entity_type
- entity_id
- timestamp
- source
- structured payload
- confidence
- raw_input_reference

### Requirement

Current state should be convenient to query.

Historical events should remain immutable.

Do not implement full event sourcing unless necessary.

Use a pragmatic hybrid:

- ordinary relational current-state tables
- immutable audit/event ledger

### Build timeline queries

Examples:

- all health events last 30 days
- all events related to goal X
- strategy changes for goal X
- actions completed last week

### Acceptance criteria

Magnus can answer internally:

> What changed in this goal over the last month?

---

# DAY 4 — TELEGRAM CONVERSATION LAYER

## Objective

Make Telegram a clean input/output surface.

Do not let Telegram-specific code leak into domain logic.

### Implement

Telegram update adapter

Conversation service

Message persistence

User mapping

Basic command router

Commands:

`/start`

`/help`

`/status`

`/now`

Commands may initially return placeholders.

### Persist

Raw user messages.

Assistant responses.

Telegram message ID.

Timestamp.

Conversation correlation ID.

### Requirement

Domain services must be callable independently of Telegram.

Later UI should reuse the same backend.

### Acceptance criteria

User can send:

> Hello Magnus

and conversation history is persisted properly.

---

# DAY 5 — NATURAL LANGUAGE CAPTURE ENGINE

## Objective

Turn ordinary language into structured candidate updates.

### Input examples

> I want to lose 20 kg.

> I want to reach 90 kg by July.

> Gym done.

> I walked around 9k today.

> PM role feels less important to me now.

> Need to renew passport.

### Create structured extraction schema

Possible intents:

- CREATE_LIFE_OBJECT
- UPDATE_LIFE_OBJECT
- RECORD_EVIDENCE
- COMPLETE_ACTION
- CREATE_ACTION
- REFLECTION
- CHANGE_STRATEGY
- ARCHIVE_OBJECT
- UNKNOWN

### Critical architecture rule

LLM proposes.

Application validates.

Domain service commits.

Never allow LLM output to directly mutate the database.

Pipeline:

```text
User text
→ structured extraction
→ validation
→ ambiguity detection
→ optional clarification
→ command
→ domain service
→ event
→ response
```

### Add confidence thresholds

High confidence:

execute directly when low risk.

Medium:

confirm.

Low:

ask clarification.

### Acceptance tests

Message:

> Gym done

should not accidentally create a new gym goal.

Message:

> Maybe I don't want to change jobs anymore

must not automatically archive the career goal.

It should recognize ambiguity.

---

# DAY 6 — CONVERSATIONAL LIFE-MODEL ONBOARDING

## Objective

Allow Magnus to establish the user's life model without a giant questionnaire.

### Build `/start` onboarding

Magnus should ask progressively.

Suggested starting question:

> What are the 3–5 things in your life you care most about improving or protecting right now?

Then conversationally determine:

- life area
- object type
- desired state
- rough current state
- importance
- timeframe where relevant

### Avoid collecting initially

- every metric
- every habit
- detailed routines
- dozens of goals

### Onboarding target

User should have a usable Magnus model within 10 minutes.

### Build goal-quality evaluator

Check whether Magnus knows enough to reason.

Possible states:

- READY
- PARTIAL
- VAGUE

Example:

> Be healthier

PARTIAL.

Magnus may ask:

> What's the biggest outcome you'd want to see over the next year?

### Acceptance criteria

A fresh user can establish three meaningful life objects conversationally.

---

# DAY 7 — ACTION + ATTENTION MODEL

## Objective

Build the first version of Magnus's hero capability:

`/now`

### Action fields

- description
- linked object
- urgency
- importance
- estimated duration
- cognitive load
- energy requirement
- due date
- blocked
- dependency
- source
- status

### Build deterministic scoring first

Possible inputs:

- importance of parent goal
- urgency
- trajectory risk
- due date
- action readiness
- blocked status
- estimated duration
- user context if known

LLM can explain rankings.

LLM should not solely invent ranking.

### `/now`

Should return:

1. one recommended action
2. short explanation
3. optionally two alternatives

Example:

> **Do MTU cohort analysis next.**
>
> It is currently your highest-risk work commitment, isn't blocked, and fits the ~45-minute window you've said you have.
>
> After that: gym.

### Acceptance tests

Blocked actions cannot rank first.

Low-importance overdue tasks should not automatically beat high-value actions.

---

# DAY 8 — `/TODAY` + DAILY PLANNING

## Objective

Translate the life model into a small daily focus.

### `/today`

Return maximum:

**3 meaningful priorities.**

Do not generate 12-task schedules.

Possible structure:

> **Today**
>
> 1. Work — MTU cohort analysis  
> 2. Health — gym  
> 3. Personal — passport call
>
> Everything else can wait.

### Build priority budget

Each day has limited attention.

Magnus should explicitly avoid overcommitting.

### Create DailyPlan entity

- date
- priorities
- rationale
- generated_at
- revised_at

Track whether recommended priorities were completed.

### Acceptance criteria

Magnus never recommends >3 "top priorities."

---

# DAY 9 — EVIDENCE ENGINE

## Objective

Build the bridge between reality and Magnus's internal model.

### Evidence types

NUMERIC

BINARY

TEXTUAL

BEHAVIORAL

SELF_REPORTED

EXTERNAL

### Every evidence item must include

- timestamp
- value
- unit when applicable
- source
- confidence
- linked indicator/object if known

### Examples

> Weight today 111.4

> Gym done.

> Interview went badly.

> I spent ₹20k more than planned this month.

### Build evidence association

Magnus should infer which goal/indicator evidence belongs to.

If uncertain:

ask.

### Acceptance criteria

Magnus can accumulate a time series for numeric indicators.

---

# DAY 10 — TRAJECTORY ENGINE

## Objective

Answer:

> Are we actually moving toward the desired state?

### Implement TrajectoryAssessment

Fields:

- object_id
- assessment_date
- expected_state
- observed_state
- trajectory_status
- deviation
- confidence
- evidence_ids
- explanation

### For numeric targets

Support simple expected trajectory.

Example:

112 kg → 90 kg over 12 months.

Compare rolling observed trend.

### For non-numeric goals

Allow qualitative assessments:

- improving
- stable
- worsening
- unknown

### Important

Separate:

**activity completion**

from

**outcome movement.**

This is essential.

### Acceptance criteria

90% gym adherence + flat body weight must not be classified as "health goal on track" merely because routine adherence is high.

---

# DAY 11 — ADHERENCE ENGINE

## Objective

Determine whether the chosen strategy is actually being executed.

### Build StrategyAdherence assessment

Analyze:

- routines
- actions
- leading indicators

Return:

- HIGH
- MEDIUM
- LOW
- UNKNOWN

and confidence.

### Example

Strategy:

4 gyms/week.

Observed:

3.7 average.

High adherence.

### Critical rule

Trajectory and adherence must be completely separate.

Possible combinations:

| Adherence | Outcome | Interpretation |
|---|---|---|
| High | Good | continue |
| Low | Poor | execution/routine issue |
| High | Poor | strategy issue |
| Low | Good | strategy may be unnecessary or other factors matter |

This matrix feeds diagnosis.

---

# DAY 12 — DIAGNOSIS ENGINE V1

## Objective

This is the heart of Magnus.

Build diagnosis using explicit rules plus LLM reasoning.

### Possible diagnoses

EXECUTION_FAILURE

ROUTINE_FAILURE

STRATEGY_FAILURE

GOAL_ISSUE

INSUFFICIENT_INFORMATION

NO_INTERVENTION_NEEDED

### Suggested first-pass logic

If:

trajectory bad  
+ adherence low

→ likely EXECUTION or ROUTINE.

Then inspect repeated patterns.

If failures repeatedly occur under similar conditions:

→ ROUTINE_FAILURE more likely.

If:

trajectory bad  
+ adherence high

→ STRATEGY_FAILURE.

If:

user repeatedly deprioritizes goal  
+ expresses declining desire

→ GOAL_ISSUE candidate.

If evidence confidence low:

→ INSUFFICIENT_INFORMATION.

### Diagnosis output must contain

- diagnosis
- confidence
- supporting evidence
- competing explanations
- proposed next review/action

### Never present low-confidence diagnosis as fact.

---

# DAY 13 — ADAPTATION / REVIEW CONVERSATION

## Objective

Magnus must help the user decide what changes.

Do not automatically change major strategies/goals.

### Build ReviewSession

Review types:

EXECUTION_REVIEW

ROUTINE_REVIEW

STRATEGY_REVIEW

GOAL_REVIEW

### Example flow

Magnus:

> Your weight trajectory has been behind plan for six weeks.
>
> Exercise adherence is high.
>
> Food consistency appears to be the major uncontrolled variable.
>
> I think this is more likely a strategy/execution issue around food than an exercise problem.
>
> Want to:
>
> A. simplify weekday food
> B. redesign weekends
> C. reduce expected weight-loss rate
> D. inspect the evidence first

The user must remain in control.

### Persist decisions

If strategy changes:

create new strategy version.

Never rewrite history.

---

# DAY 14 — WEEKLY REVIEW

## Objective

Create the first real "Magnus magic" experience.

Command:

`/weekly`

### Weekly review should answer

1. What changed?
2. What's moving?
3. What's drifting?
4. What mattered most?
5. What needs attention?
6. Does anything need to change?

### Example

> **Health**
>
> Weight trajectory remains behind target.
>
> Gym adherence improved from 60% → 85%.
>
> Since outcome trajectory didn't improve with exercise adherence, increasing gym frequency is unlikely to be the highest-value intervention.
>
> Weekend food remains the biggest uncertainty.
>
> **Recommendation:** keep exercise unchanged and run a two-week weekend-food experiment.

### Important

Avoid merely listing metrics.

The review must contain interpretation.

---

# DAY 15 — MEMORY + CONTEXT ENGINE

## Objective

Make Magnus feel continuous.

### Separate memory types

Stable profile

Current state

Decisions

Experiments

Preferences

Historical evidence

Conversation context

### Do not blindly stuff all history into prompts.

Build context retrieval.

Given a question, retrieve:

- relevant goal
- active strategy
- recent evidence
- latest diagnosis
- previous review decisions

### Example

User asks:

> Is my current gym routine working?

Magnus should automatically retrieve relevant health context.

### Acceptance criteria

Magnus can refer accurately to decisions made weeks earlier in test fixtures.

---

# DAY 16 — PROACTIVE INTERVENTION ENGINE

## Objective

Magnus should know when to speak without being asked.

### Build InterventionCandidate

Triggers include:

- meaningful trajectory deviation
- repeated missed action
- repeated routine failure
- stalled outcome
- conflicting goals
- goal neglect
- missing critical evidence
- upcoming decision deadline

### Every intervention gets

- importance
- confidence
- urgency
- interruption_cost
- reason

### Noise policy

Do not send intervention merely because something is imperfect.

Trigger only when:

**expected value of interruption > interruption cost**

Start conservatively.

### Telegram proactive messages

Maximum strict limits.

Do not create nagging.

---

# DAY 17 — CROSS-GOAL PRIORITIZATION

## Objective

Magnus must reason across life areas.

This is where it starts becoming a Life Intelligence system rather than independent goal trackers.

### Build conflict detection

Examples:

- intense interview preparation conflicting with sleep
- excessive work demands crowding out health
- travel disrupting routines
- savings goal conflicting with planned major purchase

### Add attention allocation factors

- importance
- urgency
- trajectory severity
- reversibility
- opportunity cost
- required effort
- available capacity

### Example output

> Career is currently the highest urgency area, but health has deteriorated enough that dropping exercise entirely would create a larger medium-term cost.
>
> Recommendation this week:
>
> Career: 60% discretionary focus  
> Health: minimum viable routine  
> Magnus project: pause

Do not try to mathematically optimize a person's entire life.

Keep reasoning explainable.

---

# DAY 18 — EVALUATION HARNESS

## Objective

Stop relying on vibes.

Create repeatable tests for Magnus intelligence.

### Build synthetic personas/scenarios

At least 20.

Examples:

### Scenario A

High adherence + poor outcome.

Expected:

strategy review.

### Scenario B

Low adherence + repeated Friday misses.

Expected:

routine review.

### Scenario C

User no longer cares about goal.

Expected:

goal review, not motivation.

### Scenario D

Insufficient dietary evidence.

Expected:

uncertainty.

### Scenario E

Lots of urgent low-value tasks.

Expected:

important strategic action still surfaces.

### Scenario F

Conflicting goals.

Expected:

explicit prioritization.

### Evaluate

- correct diagnosis
- appropriate confidence
- correct intervention
- hallucination rate
- unnecessary intervention rate
- quality of `/now`
- quality of weekly review

### Create evaluation command

Example:

`python -m evaluations.run`

Produce scored output.

---

# DAY 19 — RELIABILITY, SAFETY, OBSERVABILITY

## Objective

Make Magnus trustworthy enough to dogfood.

### Add structured logging

Track:

- incoming message
- extraction
- domain command
- database write
- model call
- reasoning latency
- token usage
- failures

### Add error handling

Telegram should never expose tracebacks.

### Add retries where reasonable.

### Add idempotency

Telegram duplicate update should not create duplicate evidence/action.

### Add auditability

For every important recommendation, Magnus should be able to answer internally:

> What evidence caused this?

### Add data export

At minimum JSON export.

### Add reset command for development.

### Security basics

- secrets outside repo
- encrypt sensitive tokens
- authorization based on Telegram user ID
- no arbitrary user access
- sanitize logs

---

# DAY 20 — REAL DOGFOOD DAY

## Objective

Stop building.

Use Magnus.

Populate it with a realistic personal model.

At minimum:

Health

Career

Wealth

Personal project / Magnus

Relationship or happiness standard

### Use it throughout one real day.

Morning:

`/today`

During day:

natural-language captures

Multiple:

`/now`

Evening:

review

Then manually inspect:

- wrong assumptions
- annoying messages
- excessive friction
- missing context
- poor recommendations
- unnecessary questions
- state corruption
- overconfident reasoning

### Fix only high-severity product problems.

Do not add shiny features.

### Record every failure in:

`DOGFOOD_FINDINGS.md`

Classify:

P0 — breaks trust/core loop

P1 — meaningfully harms usefulness

P2 — minor UX issue

P3 — future enhancement

Only fix P0/P1 today.

---

# DAY 21 — FREEZE THE CORE + MVP RELEASE

## Objective

Finish a coherent Magnus V1.

No new capability today.

### Perform complete end-to-end flow

Fresh database.

1. `/start`
2. create life model
3. create outcome
4. define strategy
5. create routines/actions
6. log evidence
7. `/today`
8. `/now`
9. complete actions
10. simulate multiple days
11. evaluate trajectory
12. generate diagnosis
13. trigger review
14. change strategy
15. preserve strategy history
16. `/weekly`
17. proactive intervention

### Create final docs

`README.md`

`PRODUCT_CONTRACT.md`

`ARCHITECTURE.md`

`DOMAIN_MODEL.md`

`INTELLIGENCE_ENGINE.md`

`TELEGRAM_UX.md`

`EVALUATIONS.md`

`KNOWN_LIMITATIONS.md`

`UI_PHASE_REQUIREMENTS.md`

### UI_PHASE_REQUIREMENTS.md

Document what we learned about what the future visual interface actually needs.

Do not design screens yet.

Record:

- information frequently requested
- state users need visibility into
- actions requiring buttons
- areas where Telegram is awkward
- repeated navigation patterns
- visualizations that would materially improve understanding

The future UI should emerge from 21 days of observed behavior.

---

# FINAL MVP BEHAVIOR

At Day 21 the following conversation should work.

User:

> I want to get down to 90 kg by July next year.

Magnus:

understands desired state.

User:

> I'm 112 right now.

Magnus:

creates current state.

User:

> Plan is gym four times a week, walk daily and eat in a deficit.

Magnus:

creates strategy + leading indicators.

Over several simulated weeks:

> Gym done.

> 10k steps today.

> Diet went badly this weekend.

> Weight 111.8.

Magnus accumulates evidence.

Eventually:

> Your weight trajectory is materially behind the rate required to reach 90 kg by July.
>
> Exercise adherence is strong, so adding more training isn't the obvious intervention.
>
> The main weakness in the available evidence is dietary consistency, particularly weekends.
>
> I recommend we review the food routine before changing the goal or training strategy.

THAT is Magnus.

Not:

> Great job! Keep going! 💪

---

# CORE DATABASE CONCEPT

Suggested conceptual graph:

```text
User

LifeArea
    ↓
LifeObject
    ↓
DesiredState
CurrentState
Strategy(versioned)
    ↓
Indicators
    ↓
Evidence
    ↓
TrajectoryAssessment
    ↓
AdherenceAssessment
    ↓
Diagnosis
    ↓
ReviewSession
    ↓
Decision
    ↓
Updated Strategy / Routine / Goal

LifeObject
    ↓
Actions
Routines

All meaningful changes
    ↓
Event Ledger
```

---

# CORE SERVICES

Aim for services approximately like:

```text
LifeModelService

CaptureService

EvidenceService

ActionService

PriorityService

TrajectoryService

AdherenceService

DiagnosisService

ReviewService

InterventionService

ContextService

ConversationService
```

Avoid:

```text
MagnusGodAgent.do_everything()
```

---

# LLM RESPONSIBILITY

Use LLMs for:

- language understanding
- semantic extraction
- qualitative synthesis
- explanation
- hypothesis generation
- ambiguity assessment
- reflection interpretation

Do NOT delegate blindly:

- database mutations
- permissions
- dates/calculations where deterministic code is possible
- trajectory calculations
- basic priority constraints
- event creation
- state transitions

Preferred pattern:

```text
Deterministic system establishes facts.

LLM interprets facts.

Deterministic system validates interpretation.

Magnus communicates interpretation.
```

---

# PROMPT ARCHITECTURE

Do not create one 10,000-token system prompt.

Separate prompts by job.

Suggested:

`capture_extraction.md`

`goal_clarification.md`

`trajectory_interpretation.md`

`diagnosis.md`

`weekly_review.md`

`priority_explanation.md`

`review_facilitator.md`

`intervention_writer.md`

Each prompt should have explicit structured output schemas.

---

# CONFIDENCE MODEL

Every important inference should carry confidence.

Suggested:

0.0–1.0 internally.

User-facing:

High confidence

Moderate confidence

Low confidence

Do not expose numerical confidence unless useful.

Example:

> My strongest hypothesis is that weekends are driving the diet variance, but I don't yet have enough evidence to call that confidently.

This behavior is essential.

---

# INTERVENTION PHILOSOPHY

Magnus should not optimize for messages sent.

It should optimize for useful decisions.

Every proactive intervention should pass:

1. Is something meaningfully different?
2. Does Magnus have enough evidence?
3. Can the user do something useful with this information?
4. Is now the right time?
5. Has Magnus already said this recently?

If not:

stay quiet.

---

# DAILY PRODUCT LOOP

## Morning

Orient.

> What matters today?

## Day

Capture + execute.

> What's next?

## Evening

Close loops.

> What happened?

## Weekly

Diagnose.

> Is this working?

## Triggered

Adapt.

> Should something change?

That is the entire product loop.

---

# PRODUCT METRICS FOR DOGFOOD

Do not optimize DAU yet.

Track:

### Useful Decision Rate

Did Magnus cause a useful decision the user would probably not otherwise have made?

### Recommendation Acceptance

Was `/now` actually useful?

### Intervention Precision

Of proactive interventions, how many were useful?

### Unnecessary Intervention Rate

How often did Magnus bother the user unnecessarily?

### State Accuracy

Does Magnus's representation match reality?

### Diagnosis Accuracy

Did Magnus identify the correct layer of failure?

### Maintenance Burden

How much time does user spend feeding Magnus?

Long-term aspiration:

**<5 minutes/week of forced system maintenance.**

---

# DEFINITION OF MVP SUCCESS

The 21-day MVP is successful if:

1. Magnus can build a meaningful life model conversationally.

2. The user does not need to manually maintain elaborate dashboards.

3. `/now` consistently suggests sensible next actions.

4. Magnus distinguishes action completion from outcome progress.

5. Magnus detects meaningful trajectory drift.

6. Magnus can distinguish low adherence from ineffective strategy.

7. Magnus occasionally says:

> I don't have enough evidence.

8. Magnus can initiate an appropriate review.

9. Strategy changes are versioned and remembered.

10. Weekly reviews produce at least one insight more useful than a normal habit/task summary.

11. Telegram alone is enough to use Magnus every day.

12. The user wants to continue using it after the test.

---

# HARD RULES FOR CURSOR THROUGHOUT THE BUILD

Before implementing any new feature, answer:

### A.

Which of Magnus's four questions does this improve?

- What do I want?
- Where do I stand?
- What should I do next?
- Should something change?

If none:

do not build it.

### B.

Could this instead be handled by an existing external system?

If yes:

prefer future integration rather than rebuilding the product.

### C.

Does this require additional user maintenance?

If yes:

justify why the value exceeds the burden.

### D.

Are we storing facts separately from interpretations?

If no:

redesign it.

### E.

Could an LLM error corrupt state?

If yes:

insert deterministic validation.

---

# CURSOR OPERATING INSTRUCTION

At the beginning of every development day:

1. Read:
   - PRODUCT_CONTRACT.md
   - ARCHITECTURE.md
   - previous day's completion notes.

2. State:
   - today's objective
   - files expected to change
   - what explicitly will NOT be built.

3. Implement smallest coherent solution.

4. Run automated tests.

5. Add tests for today's new behavior.

6. Run lint/type checks.

7. Update architecture documentation if necessary.

8. Write:

`docs/daily/day-XX.md`

containing:

- what was built
- architecture decisions
- known limitations
- unfinished issues
- tests
- recommended next step

9. Do not begin tomorrow's scope.

---

# FINAL INSTRUCTION TO CURSOR

The purpose of this 21-day build is NOT to produce the largest possible LifeOS.

The purpose is to prove the smallest possible system that can intelligently manage the distance between a person's intentions and reality.

Whenever simplicity and breadth conflict:

choose simplicity.

Whenever tracking and intelligence conflict:

choose intelligence.

Whenever engagement and usefulness conflict:

choose usefulness.

Whenever certainty and honesty conflict:

admit uncertainty.

Whenever building another module and integrating an existing system conflict:

prefer integration.

Whenever Magnus is about to tell the user merely to “try harder”:

ask whether the routine, strategy or goal is actually wrong.

At Day 21, Magnus should feel like:

**someone intelligent has continuously understood what I am trying to achieve, watched what actually happened, remembered the decisions we made, and helped me adjust intelligently.**

That is the MVP.