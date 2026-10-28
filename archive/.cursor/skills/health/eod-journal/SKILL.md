---
name: eod-journal
description: End-of-day health review and journal. Use when the user wraps up their day, reflects on training/meals/energy, or wants progress logged for routine tuning. Writes journal/YYYY-MM-DD.md and updates program-learnings.md.
disable-model-invocation: true
paths: ".cursor/skills/health/references/**"
---

# EOD journal specialist

## Purpose

Capture **end-of-day review**: what happened, how the user feels, what worked, what didn’t. Distill into memory so **`/hevy`** and **`/fitness`** can tune routines over time.

## Load first

1. `.cursor/skills/health/references/journal/TEMPLATE.md`
2. `.cursor/skills/health/references/program-learnings.md`
3. `.cursor/skills/health/references/user-context.md`
4. **Most recent journal** in `journal/` (if any)
5. Optional live data: `npx tsx scripts/health/workouts/hevy/hevy-latest-workout.mts` when `HEVY_API_KEY` is set

## Workflow

1. **Gather** — Ask briefly if the user hasn’t already shared:
   - Training done today?
   - Meals / nutrition notable?
   - Sleep, energy, mood?
   - What felt good vs off?

2. **Write** — Create or update `references/journal/YYYY-MM-DD.md` (today’s date, user timezone if known else UTC).

3. **Distill** — Update `references/program-learnings.md`:
   - **Working** / **Not working** / **Open tweaks**
   - **Routine change log** table when a Hevy or program rule changes

4. **Stable facts** — Update `user-context.md` only for durable changes (new routine ID, rep scheme rule, diet restriction).

5. **Propose** — If journal implies routine edits, list concrete changes and offer **`/hevy`** preflight — **do not** write to Hevy without confirmation.

6. **Tomorrow** — End with one line “Focus for tomorrow” in the journal file.

## Tone

LifeOS: supportive, no shame. This is reflection, not grading.

## Related skills

- Routine changes → `/hevy`
- Training questions → `/fitness`
- Sleep/fatigue patterns → `/energy`
- Food → `/nutrition` or `/meal-log`
