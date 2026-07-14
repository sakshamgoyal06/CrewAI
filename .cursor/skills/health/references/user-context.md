# Health — user context (living memory)

Maintained by the **Health Cursor agent** (`/health`). Update when the user establishes durable preferences, program changes, or new Hevy IDs.

_Last updated: 2026-07-14 (EOD journal)_

## Goals

- Build and run a **Hevy-based workout program** inside Magnus.
- This Cursor chat is the dedicated **health agent** pillar.

## Training program

- Split style: **Push A / Pull A / Cardio+Abs / Push B / Pull B / Legs** (+ Pre-Program Primer).
- **Compounds:** 3×8–10 (normal sets).
- **Isolations / abs:** 3×12–15.
- **Treadmill:** 20 min (1200 s); notes often include speed ~3.7–4.0, incline 14–16.
- **No warm-ups** in routine templates (user warms up ad hoc).
- **Preflight before create:** show exercise mapping table + payload → wait for confirmation before `createRoutine`.

## Hevy

- **Coach folder ID:** `3206984` (verify before writes).
- **API key:** `HEVY_API_KEY` in `.env` (gitignored).

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

- Order includes **Barbell Bench** (not chest press machine).
- Abs: **3×12** (Cable Crunch, Hanging Knee Raise).
- Treadmill last; 20 min with incline/speed in exercise notes.

### Pull A notes (current)

- **Primary:** back width (pulldowns) — **no rows** (rows on Pull B).
- **Pending swap:** remove **Pull Up (Assisted)** → **Lat Pulldown - Close Grip (Cable)** (`4E5257DE`) — assist machine unstable.
- Rear delt reverse fly: machine **base+1 height** (user note).
- Finisher: queue podcast/video when training late; ~3 min stretch minimum even when tired.

## Diet

- **13 Jul EOD:** Okay until evening; **dinner a bit heavy**. User wants to **fix nutrition slowly** (with steps) — not a crash diet.
- _(Add: eating style, restrictions, meal timing, macro targets when shared.)_

## Recovery / energy

- **13 Jul:** Short sleep but **woke refreshed**; good energy for full Push A.
- **Stretching** after training helped feel fine all day — keep as habit.
- _(Add: typical sleep hours, HRV, patterns over time.)_

## Long-term

_(Add: race dates, season goals, multi-month arcs.)_

## EOD journal

- **Habit:** end of day → `/eod-journal` — review progress, log how you feel.
- **Files:** `references/journal/YYYY-MM-DD.md`, distilled in `references/program-learnings.md`.
- **Latest:** `references/journal/2026-07-14.md` — Pull A complete; Cardio+Abs or rest next.
