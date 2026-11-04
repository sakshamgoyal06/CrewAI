/**
 * What the plan setup asks (plan doc, "Setup inputs"): meals and times, restrictions, foods they
 * love, time to cook per meal, who cooks, kitchen, staples, and meals usually eaten out. The diet
 * type and the avoid list stay where onboarding keeps them (`user_health_profile`).
 */
import { z } from "zod";

import { DEFAULT_SHARES, PLAN_SLOTS, type PlanSlot } from "./targets.js";

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM");

/** Minutes they can spend cooking a meal: 0 = none (ready, ordered, mess). null = no limit. */
export const COOK_MINUTES = [0, 10, 20, 30] as const;
export const WHO_COOKS = ["self", "family", "cook", "canteen"] as const;
export const KITCHENS = ["full", "basic", "none"] as const;
export const STAPLES = ["roti", "rice", "both"] as const;

const slotSetup = z.object({
  slot: z.enum(PLAN_SLOTS),
  time: HHMM.nullable().optional(),
  share: z.coerce.number().int().min(5).max(70),
  /** Most minutes they can spend cooking it; null = no limit (someone else cooks, or anything goes). */
  cookMinutes: z.union([z.literal(0), z.literal(10), z.literal(20), z.literal(30)]).nullable().optional(),
});

/** A daily supplement from the catalog ("Whey protein"), how many servings, and the meal it goes with (null = spread). */
export const supplementInput = z.object({
  name: z.string().trim().min(1).max(40),
  servings: z.coerce.number().min(0.5).max(4).default(1),
  slot: z.enum(PLAN_SLOTS).nullable().optional(),
});

export const dietPrefsInput = z.object({
  meals: z.array(slotSetup).min(1).max(4).refine((m) => new Set(m.map((x) => x.slot)).size === m.length, "each meal once"),
  /** Free-text restrictions the model review reads ("no onion-garlic on Tuesdays", "diabetic"). */
  restrictions: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  /** 0 = Sunday … 6 = Saturday. */
  fastingDays: z.array(z.coerce.number().int().min(0).max(6)).max(7).default([]),
  loves: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  whoCooks: z.enum(WHO_COOKS).default("self"),
  kitchen: z.enum(KITCHENS).default("full"),
  staples: z.enum(STAPLES).default("both"),
  /** Supplements taken daily (whey, creatine, a gainer): their calories and protein come off the meal budgets. */
  supplements: z.array(supplementInput).max(8).default([]),
  /** Meals usually eaten out: planned as a budget, not a dish. */
  eatOut: z.array(z.object({ day: z.coerce.number().int().min(0).max(6), slot: z.enum(PLAN_SLOTS) })).max(28).default([]),
});

export type DietPrefsInput = z.input<typeof dietPrefsInput>;
export type DietPrefs = z.output<typeof dietPrefsInput>;

/** The setup screen's starting answers: four meals at the default shares, no cooking limit. */
export function defaultPrefs(times: Partial<Record<PlanSlot, string>> = {}): DietPrefs {
  return dietPrefsInput.parse({
    meals: PLAN_SLOTS.map((slot) => ({ slot, time: times[slot] ?? null, share: DEFAULT_SHARES[slot], cookMinutes: null })),
  });
}

export function shares(p: DietPrefs): Partial<Record<PlanSlot, number>> {
  return Object.fromEntries(p.meals.map((m) => [m.slot, m.share]));
}

/**
 * Most prep minutes an option may need for a meal. Someone else cooking lifts the limit, and so
 * does no kitchen: their food comes from a mess, canteen or tiffin, and the plan says what to
 * pick there. A basic kitchen (microwave, kettle) caps it at 10.
 */
export function prepLimit(p: DietPrefs, slot: PlanSlot): number | null {
  if (p.kitchen === "none") return null;
  const own = p.meals.find((m) => m.slot === slot)?.cookMinutes ?? null;
  const cap = p.kitchen === "basic" ? 10 : null;
  if (p.whoCooks === "family" || p.whoCooks === "cook") return cap;
  if (own === null) return cap;
  return cap === null ? own : Math.min(own, cap);
}

export function isEatOut(p: DietPrefs, weekday: number, slot: PlanSlot): boolean {
  return p.eatOut.some((e) => e.day === weekday && e.slot === slot);
}
