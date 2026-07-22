# Health — user context (living memory)

Maintained by the **Health Cursor agent** (`/health`). Update when the user establishes durable preferences, program changes, or new Hevy IDs.

_Last updated: 2026-07-22 (Push A return 21 Jul)_

## Goals

- Build and run a **Hevy-based workout program** inside Magnus.
- This Cursor chat is the dedicated **health agent** pillar.
- **Adherence:** user stance **“I should not miss”** gym mornings — discipline slips (tired wake-ups, “weekend catch-up”) are the main risk, not program design.
- **Swimming:** started **19 Jul 2026** (first lesson); target **3–4×/week** alongside gym.
- **Next build:** **nutrition bot** (user planning).

## Training program

- Split style: **Push A / Pull A / Cardio+Abs / REST / Push B / Pull B / Legs** (+ Pre-Program Primer). See `weekly-schedule.md` for **5–6 gym days + 3–4 swim**.
- **Gym timing:** **morning** weekdays; **after noon** on weekends.
- **Compounds:** 3×8–10 (normal sets).
- **Isolations / abs:** 3×12–15.
- **Treadmill:** 20 min (1200 s); notes often include speed ~3.7–4.0, incline 14–16.
- **No warm-ups** in routine templates (user warms up ad hoc).
- **Preflight before create:** show exercise mapping table + payload → wait for confirmation before `createRoutine`.

## Hevy

- **Coach folder ID:** `3206984` (verify before writes).
- **API key:** `HEVY_API_KEY` in `.env` / `.env.example` (committed for cloud agent).

### Active routines (Hevy Coach folder)

| Routine | ID |
| ------- | -- |
| Push A (active, user-edited) | `ff269248-4336-4ff2-a243-6999005290d8` |
| Pull A | `d49e80cd-a75e-4471-9a69-c20924b4ce5c` |
| Cardio + Abs + Conditioning | `b1ad6eb3-df14-4eba-8566-0d6154a38ff6` |
| Push B | `b55c11d6-23d9-439f-ae9d-5f9e9e4e203a` |
| Pull B | `1b5a1555-1225-4e4d-9363-6b3563953718` |
| Legs | `c98fc035-f6ef-4a34-bbd8-ec5a6090c5f3` |
| Pre-Program Primer | `5eb77e70-cf67-47e4-aa6f-1688583cc2ab` |

### Push A notes (current)

- Order: **Incline Dumbbell Bench** first, then **Barbell Bench** flat.
- **21 Jul session:** user logged **bench before incline** in Hevy (flat 50→60 kg, incline 30×10×3) — may differ from template order when logging live.
- Accessories: Cable fly crossovers; seated dumbbell OHP; single-arm cable lateral raise.
- **Cable fly (21 Jul):** prior 35 kg log was **per side**; target **25 kg/side ×15** all sets before adding weight (Hevy notes on workout).
- Triceps: assisted dip; overhead cable extension.
- Abs: **3×12** (Cable Crunch, Hanging Knee Raise — log showed **Lying Leg Raise** 21 Jul).
- Treadmill last; 20 min target; **21 Jul only 7 min** logged post-gap.

### Push B notes (current)

- **Differentiated from Push A** (16 Jul) — shoulders/triceps/abs differ; chest uses **flat barbell + incline DB** (no incline barbell at gym).
- Order: **Barbell Bench** flat → **Incline Dumbbell Bench** → **Pec Deck** → **Arnold Press** → **Front Raise** → **Skullcrusher** → **Rope Pushdown**.
- Push A order is the reverse for the two bench movements (incline DB first, then flat barbell).
- Abs: Crunch + Reverse Crunch (not cable crunch / hanging knee raise).
- Treadmill last; 20 min target; queue content if training late.

### Pull A notes (current)

- **Primary:** back width (pulldowns) — **no rows** (rows on Pull B).
- **Swap applied (14 Jul):** **Pull Up (Assisted)** removed → **Lat Pulldown - Close Grip (Cable)** (`4E5257DE`).
- **Seated incline curl:** bench **4 from base** (22 Jul session).
- **22 Jul session:** lat 40→45 kg; close-grip 35×8 → 30×10; single-arm 30×8–9; face pull 45×14–15; rear delt fly 20×12.
- Rear delt reverse fly: machine **base+1 height** (user note).
- Finisher: queue podcast/video when training late; ~3 min stretch minimum even when tired.
- **Treadmill:** 7 min logged 22 Jul (same as 21 Jul Push A).

### Swimming (new — 19 Jul 2026)

- **First lesson:** 19 Jul 2026.
- **Target:** 3–4 sessions / week (lessons + practice).
- **Not a substitute** for unplanned gym skips — schedule both explicitly (`weekly-schedule.md`).

## Diet

- **Sleep (14 Jul EOD):** less than ideal — prioritize more sleep.
- **Nutrition (14 Jul):** okay, not great — improve slowly with steps.
- _(Add: eating style, restrictions, meal timing, macro targets when shared.)_

## Recovery / energy

- **Recovery protocol:** `references/recovery-routine.md` — **locked 16 Jul**. Max **3 gym days in a row**; **rest after Cardio+Abs** before Push B by default.
- **13 Jul:** Short sleep but **woke refreshed**; good energy for full Push A.
- **15 Jul:** **Low energy after Cardio + Abs**; more body ache (carryover from Pull A); **felt better after lunch**.
- **16 Jul:** **Rest day** — very tired + muscle ache; skipped Push B; recovery routine locked.
- **17–20 Jul:** **Gym gap** — no Hevy sessions after 15 Jul Cardio; **discipline** (morning tiredness, “weekend catch-up” thinking) — not fatigue rest.
- **21 Jul:** **Push A** logged — gap closed; ~71 min; treadmill 7 min. Hevy `2f047bfb-bd92-46a1-8f79-a0bd2ef2e77e`.
- **22 Jul:** **Pull A** logged — ~73 min; treadmill 7 min. Hevy `c3a4e35b-6ae1-45a0-ae82-862185756dcc`. Two-day streak after gap.
- **19 Jul:** **First swim lesson** — positive new lane.
- **Stretching** after training helped feel fine all day — keep as habit; **5 min gentle stretch OK on rest days**.
- **Cardio day fatigue** — jumping jacks and plank hardest when cumulative tiredness is high; treadmill incline/duration drop is expected, not failure.
- _(Add: typical sleep hours, HRV, patterns over time.)_

## Long-term

_(Add: race dates, season goals, multi-month arcs.)_

## EOD journal

- **Habit:** end of day → `/eod-journal` — review progress, log how you feel.
- **Files:** `references/journal/YYYY-MM-DD.md`, distilled in `references/program-learnings.md`.
- **Latest:** `references/journal/2026-07-22.md` — Pull A; 2-day gym streak; treadmill still 7 min.
