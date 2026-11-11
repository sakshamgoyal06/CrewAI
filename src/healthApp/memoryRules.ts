/**
 * Which coach-memory rule lines the plan already follows (5 Nov audit, finding 12).
 *
 * A line like "Vegetarian only until 25 Nov" can sit in memory next to the structured rule that
 * really drives the plan (the temporary diet, a gym pause or swap). The You tab used to call every
 * such line "chat only", even when the plan had it. Here a time-bound rule line counts as in the
 * plan when the structured rules cover every day from today to the line's end date.
 */
import { addDays } from "../util/time.js";
import { loadBreaks } from "./breaks.js";
import { ruleKind, type MemoryLine, type RuleKind } from "./coachMemory.js";
import { activeOverride } from "./dietPlan/dietPeriod.js";
import { loadDietPrefs } from "./dietPlan/store.js";
import { isGym } from "./routine.js";
import { loadRoutine } from "./routineStore.js";

/** A stretch of days a structured rule holds, both ends included (YYYY-MM-DD). */
export type Span = { from: string; until: string };
export type RuleSpans = Record<RuleKind, Span[]>;

/** The last day covered without a gap from `today`; null when today itself isn't covered. Pure. */
export function coveredThrough(spans: Span[], today: string): string | null {
  let through: string | null = null;
  for (let grew = true; grew; ) {
    grew = false;
    const need = through ? addDays(through, 1) : today;
    for (const s of spans) {
      if (s.from <= need && s.until >= need && (!through || s.until > through)) {
        through = s.until;
        grew = true;
      }
    }
  }
  return through;
}

/** The date the plan holds this line's rule until, when it covers the whole line; else null. Pure. */
export function inPlanUntil(line: Pick<MemoryLine, "text" | "expiresOn">, spans: RuleSpans, today: string): string | null {
  const kind = ruleKind(line.text);
  if (!kind || !line.expiresOn) return null;
  const through = coveredThrough(spans[kind], today);
  return through && through >= line.expiresOn ? through : null;
}

/** The structured rules for food (temporary diet) and training (gym pauses, swaps, plan pauses). Never throws. */
export async function loadRuleSpans(userProfileId: string, today: string): Promise<RuleSpans> {
  const [prefs, breaks, routine] = await Promise.all([
    loadDietPrefs(userProfileId).catch(() => null),
    loadBreaks(userProfileId, today).catch(() => []),
    loadRoutine(userProfileId).catch(() => null),
  ]);
  const food: Span[] = [];
  const ov = activeOverride(prefs?.prefs.dietOverride, today);
  if (ov) food.push({ from: ov.from, until: ov.until });
  const gyms = (routine ?? []).filter(isGym);
  const gymIds = new Set(gyms.map((i) => i.id));
  const training: Span[] = [
    ...breaks.filter((b) => b.scope === "plan" || (b.itemId && gymIds.has(b.itemId))).map((b) => ({ from: b.startDate, until: b.endDate })),
    ...gyms.flatMap((i) => (i.swap ? [{ from: i.swap.from, until: i.swap.until }] : [])),
  ];
  // With several gym items, only a stretch where every one is paused or swapped is a break; a
  // plan pause covers them all. Keep it simple: one gym item is the case today; with more, only
  // plan pauses count.
  return { food, training: gyms.length > 1 ? breaks.filter((b) => b.scope === "plan").map((b) => ({ from: b.startDate, until: b.endDate })) : training };
}
