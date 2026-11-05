/**
 * Every food rule the plan must keep, from every place the person gave one, in one shape:
 * - food settings: diet, diet note, foods to avoid;
 * - plan setup: "anything else to keep in mind" lines and fasting days;
 * - a temporary diet or avoid list from the coach (dietPeriod.ts).
 * Rules tied to a weekday ("no onion on Tuesdays", fasting days) apply on that day only.
 * The planner, the 3-day picks, swaps and the meal editor all read this. Pure.
 */
import { catalog, type CatalogEntry } from "../../meals/catalog/index.js";
import { activeOverride, effectiveDiet } from "./dietPeriod.js";
import { fastingSafe, nameRestrictionCheck, restrictionCheck, type PersonDiet, type PlanItem } from "./compose.js";
import type { DietPrefs } from "./prefs.js";

export type DayRule = { avoid: string[]; nonVeg: boolean; fasting: boolean };

export type PlanRules = {
  diet: PersonDiet;
  /** Foods out every day. */
  avoid: string[];
  /** Their own words for the meat policy (compose.ts allowedMeats), weekday lines left out. */
  dietNote: string[];
  /** 0 = Sunday … 6 = Saturday. */
  days: Partial<Record<number, DayRule>>;
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_RE = /\b(sun|mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?)(?:day)?s?\b/g;
const TRIGGER = /\b(?:no|avoid(?:s|ing)?|without|skip|never eat|don'?t eat|dont eat|do not eat|not eating|can'?t eat|cannot eat|can'?t have|cannot have|allergic to|allergy to|intolerant to)\s+(.+)/;
const NON_VEG = /^(?:non ?veg(?:etarian)?|nonveg|meat|any meat)$/;
/** Words after "no" that aren't a food. */
const NOT_FOOD = new Set(["", "food", "junk", "junk food", "fried food", "oily food", "outside food", "spicy food", "late eating", "breakfast", "lunch", "dinner", "snacks", "meal", "meals", "cooking", "kitchen", "time"]);

function dayOf(word: string): number | null {
  const w = word.toLowerCase();
  const i = WEEKDAYS.findIndex((d) => d.startsWith(w.slice(0, 3)));
  return i >= 0 ? i : null;
}

/**
 * Foods named in their own words: "no onion-garlic on Tuesdays", "allergic to peanuts",
 * "no non veg on Thursdays". Lines that name no food ("diabetic") are left to the coach.
 */
export function parseFoodRules(texts: string[]): { avoid: string[]; days: Partial<Record<number, DayRule>>; everyDayText: string[] } {
  const avoid = new Set<string>();
  const days: Partial<Record<number, DayRule>> = {};
  const everyDayText: string[] = [];
  for (const text of texts) {
    for (const raw of text.toLowerCase().replace(/non[\s-]?veg(etarian)?/g, "nonveg").split(/[.;\n]+/)) {
      const sent = raw.trim();
      if (!sent) continue;
      const named = [...sent.matchAll(DAY_RE)].map((m) => dayOf(m[1]!)).filter((d): d is number => d !== null);
      if (!named.length) everyDayText.push(sent);
      const m = TRIGGER.exec(sent.replace(DAY_RE, " ").replace(/\b(on|every|each|at all|please|days?)\b/g, " "));
      if (!m) continue;
      const foods = m[1]!.split(/,|\band\b|&|\/|\bor\b|\bnor\b|-|\+/).map((x) => x.replace(/\b(any|the|some|of|in|my|food|foods)\b/g, " ").replace(/\s+/g, " ").trim());
      for (const f of foods) {
        if (!f || NOT_FOOD.has(f) || f.split(" ").length > 3) continue;
        if (named.length) {
          for (const d of named) {
            const r = (days[d] ??= { avoid: [], nonVeg: false, fasting: false });
            if (NON_VEG.test(f) || f === "eggs" || f === "egg") {
              if (NON_VEG.test(f)) r.nonVeg = true;
              else r.avoid.push("egg");
            } else r.avoid.push(f);
          }
        } else if (!NON_VEG.test(f)) avoid.add(f);
      }
    }
  }
  return { avoid: [...avoid], days, everyDayText };
}

export function planRules(food: { diet: string | null; dietNote: string | null; foodAvoid: string[] }, prefs: Pick<DietPrefs, "restrictions" | "fastingDays" | "dietOverride">, today: string): PlanRules {
  const texts = [food.dietNote ?? "", ...prefs.restrictions].filter(Boolean);
  const parsed = parseFoodRules(texts);
  const ov = activeOverride(prefs.dietOverride ?? null, today);
  const days = parsed.days;
  for (const d of prefs.fastingDays) (days[d] ??= { avoid: [], nonVeg: false, fasting: false }).fasting = true;
  return {
    diet: effectiveDiet(food.diet as PersonDiet, prefs.dietOverride ?? null, today),
    avoid: [...new Set([...food.foodAvoid, ...parsed.avoid, ...(ov?.avoid ?? [])])],
    dietNote: parsed.everyDayText,
    days,
  };
}

export const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** The every-day check on a catalog food. */
export function rulesCheck(r: PlanRules): (e: CatalogEntry) => boolean {
  return restrictionCheck({ diet: r.diet, avoid: r.avoid, dietNote: r.dietNote });
}

/**
 * A check for one date: every-day rules plus that weekday's. Build once, use for many items.
 * Foods outside the catalog are checked by name.
 */
export function checkOn(r: PlanRules, date: string): (i: Pick<PlanItem, "key" | "name">) => boolean {
  const day = r.days[weekdayOf(date)];
  const cat = catalog();
  const every = rulesCheck(r);
  // A no-meat day or a fast narrows the diet to vegetarian (a vegan or Jain diet already is).
  const dayDiet: PersonDiet = (day?.nonVeg || day?.fasting) && !["vegetarian", "vegan", "jain"].includes(r.diet ?? "") ? "vegetarian" : r.diet;
  const dayCheck = day ? restrictionCheck({ diet: dayDiet, avoid: day.avoid, dietNote: [] }) : null;
  const byName = nameRestrictionCheck({ diet: dayDiet, avoid: [...r.avoid, ...(day?.avoid ?? [])] });
  return (i) => {
    const e = i.key ? cat.byKey.get(i.key) : undefined;
    if (!e) return byName(i.name ?? "");
    if (!every(e)) return false;
    if (!dayCheck) return true;
    if (!dayCheck(e)) return false;
    return !day!.fasting || fastingSafe(e);
  };
}

/** Whether a meal's items keep every rule on that date. */
export function itemsAllowedOn(r: PlanRules, date: string, items: Array<Pick<PlanItem, "key" | "name">> | undefined): boolean {
  const ok = checkOn(r, date);
  return (items ?? []).every(ok);
}

/** True when a weekday is a fasting day for them. */
export const isFastingDay = (r: PlanRules, date: string) => r.days[weekdayOf(date)]?.fasting === true;
