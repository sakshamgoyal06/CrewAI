/**
 * "Eating out tonight": plans the rest of the day around a restaurant meal, from stored numbers
 * only (no model call). Keeps a budget for the meal out, says what's left before it (with the
 * protein to get in early), and gives a few ordering rules that work at an Indian restaurant.
 * Never suggests skipping food: when the day is already spent, the advice is a lighter order.
 */
import { z } from "zod";
import { localDateKey } from "../nutrition/localDate.js";
import type { ActionContext } from "./actions.js";
import { recordChatTurn, type ChatCard } from "./chat.js";
import { buildHealthSnapshot } from "./snapshot.js";
import type { PersonDiet } from "./dietPlan/compose.js";
import { loadDigestFoodRules } from "./nightlyDigest.js";

export const eatingOutInput = z.object({ meal: z.enum(["lunch", "dinner"]).optional() });

export type EatingOutCard = {
  type: "eating_out";
  date: string;
  meal: "lunch" | "dinner";
  /** Calories to keep for the meal out; null without a calorie target. */
  reserveKcal: number | null;
  /** Calories left for everything before it; null without a target. */
  beforeKcal: number | null;
  /** Protein to get before the meal out, in grams; null without a protein target. */
  proteinBeforeG: number | null;
  lines: string[];
  tips: string[];
};

/** A restaurant meal is rarely under 700 kcal; past 1,100 the rest of the day gets too thin. */
export const RESERVE_MIN = 700;
export const RESERVE_MAX = 1100;
/** Protein a sensible restaurant order brings (a tandoori dish or dal with a main). */
export const RESTAURANT_PROTEIN_G = 30;

const round50 = (n: number) => Math.round(n / 50) * 50;

export const ORDER_TIPS = [
  "Tandoori, grilled or tikka over fried, butter or cream gravies.",
  "Roti or phulka over naan, and one portion of rice if you want it.",
  "Dal, raita and a salad fill you up for little.",
  "Skip the fried starters, or share one.",
  "One drink at most: a beer is about 150 kcal, a cocktail 200 or more.",
];

type Diet = PersonDiet;
const noEgg = (d: Diet) => d === "vegetarian" || d === "jain" || d === "vegan";
const noDairy = (d: Diet) => d === "vegan";
const noMeat = (d: Diet) => d === "vegetarian" || d === "jain" || d === "vegan" || d === "eggetarian";

/** The order tips for their diet (a veg period included): no tandoori chicken for a vegetarian. Pure. */
export function orderTips(diet: Diet = null, allows: (text: string) => boolean = () => true): string[] {
  const first = noDairy(diet)
    ? "Tandoori vegetables, chana or dal over fried or cream gravies."
    : noMeat(diet)
      ? "Paneer or soya tikka and tandoori vegetables over fried, butter or cream gravies."
      : ORDER_TIPS[0]!;
  const third = noDairy(diet) ? "Dal and a salad fill you up for little." : ORDER_TIPS[2]!;
  return [first, ORDER_TIPS[1]!, third, ORDER_TIPS[3]!, ORDER_TIPS[4]!].filter((t) => allows(t));
}

/** Protein to eat before going out, for their diet and avoid list. Pure. */
export function proteinBefore(diet: Diet = null, allows: (text: string) => boolean = () => true): string {
  const all = noDairy(diet) ? ["dal", "tofu", "sprouts", "soy milk"] : ["curd", "dal", ...(noEgg(diet) ? [] : ["eggs"]), "paneer", "sprouts", "a shake"];
  const ok = all.filter((f) => allows(f));
  return ok.length > 1 ? `${ok.slice(0, -1).join(", ")} or ${ok.at(-1)}` : (ok[0] ?? "dal");
}

/** One light main for when the day is spent. Pure. */
function lightMain(diet: Diet): string {
  return noDairy(diet) ? "one chana or dal main with salad" : noMeat(diet) ? "one paneer or soya tikka with dal or salad" : "one grilled or tandoori main with dal or salad";
}

export function eatingOutPlan(input: {
  date: string;
  meal: "lunch" | "dinner";
  calorieTarget: number | null;
  caloriesEaten: number;
  proteinTarget: number | null;
  proteinEaten: number;
  /** Their diet today (a temporary veg period included) and a check against their avoid list. */
  diet?: Diet;
  allows?: (text: string) => boolean;
}): EatingOutCard {
  const { date, meal, calorieTarget: target, caloriesEaten: eaten, proteinTarget, proteinEaten } = input;
  const diet = input.diet ?? null;
  const allows = input.allows ?? (() => true);
  const lines: string[] = [];
  let reserveKcal: number | null = null;
  let beforeKcal: number | null = null;

  if (target) {
    const left = Math.max(0, Math.round(target - eaten));
    const ideal = Math.min(RESERVE_MAX, Math.max(RESERVE_MIN, round50(target * 0.45)));
    reserveKcal = Math.min(ideal, round50(left));
    beforeKcal = Math.max(0, round50(left - reserveKcal));
    if (left < RESERVE_MIN) {
      lines.push(
        left === 0
          ? `Today's ${target} kcal are already used, so keep the ${meal} light: ${lightMain(diet)}, no starters. Tomorrow goes back to the plan.`
          : `About ${left} kcal are left today, less than a restaurant ${meal} usually is. Order ${lightMain(diet)}, skip starters and dessert, and tomorrow goes back to the plan.`,
      );
    } else {
      lines.push(`Keep about ${reserveKcal} kcal for ${meal} out.`);
      lines.push(
        beforeKcal > 0
          ? `Until then, about ${beforeKcal} kcal, mostly protein and vegetables: ${proteinBefore(diet, allows)}.`
          : "Nothing more before it, apart from tea, water or a piece of fruit.",
      );
    }
  } else {
    lines.push("Set a calorie target and I can give you a number to keep for the meal out. Until then, the rules below do most of the work.");
  }

  const proteinBeforeG = proteinTarget ? Math.max(0, Math.round(proteinTarget - proteinEaten - RESTAURANT_PROTEIN_G)) : null;
  if (proteinBeforeG && proteinBeforeG >= 15) {
    lines.push(`Get about ${proteinBeforeG} g of protein in before you go; restaurant food is light on it.`);
  }
  lines.push("Log what you order when you're back, even roughly. A rough log keeps the week honest.");

  return { type: "eating_out", date, meal, reserveKcal, beforeKcal, proteinBeforeG, lines, tips: orderTips(diet, allows) };
}

export function eatingOutReply(card: EatingOutCard): string {
  return card.reserveKcal != null && card.beforeKcal != null && card.lines[0]?.startsWith("Keep")
    ? `Eating out at ${card.meal}: keep about ${card.reserveKcal} kcal for it and ${card.beforeKcal} kcal for the rest of the day.`
    : `Here's how to handle ${card.meal} out.`;
}

/** Builds the plan from today's numbers. `record` puts it in the chat (the quick-log path). */
export async function planEatingOut(
  ctx: ActionContext,
  input: z.infer<typeof eatingOutInput>,
  opts: { record?: boolean } = {},
  deps: { snapshot?: typeof buildHealthSnapshot; recordTurn?: typeof recordChatTurn; foodRules?: typeof loadDigestFoodRules } = {},
): Promise<{ ok: true; text: string; cards: ChatCard[]; card: EatingOutCard; changed: false }> {
  const date = localDateKey(ctx.now ?? new Date(), ctx.timezone);
  const [s, rules] = await Promise.all([
    (deps.snapshot ?? buildHealthSnapshot)(ctx.userProfileId, ctx.now ?? new Date()),
    (deps.foodRules ?? loadDigestFoodRules)(ctx.userProfileId, date, date).catch(() => null),
  ]);
  const meal = input.meal ?? "dinner";
  const card = eatingOutPlan({
    date,
    diet: rules?.diet ?? null,
    allows: rules?.allows,
    meal,
    calorieTarget: s.targets.calorieTarget,
    caloriesEaten: s.today.calories,
    proteinTarget: s.targets.proteinTarget,
    proteinEaten: s.today.proteinG,
  });
  const text = eatingOutReply(card);
  if (opts.record) await (deps.recordTurn ?? recordChatTurn)(ctx.userProfileId, `Eating out at ${meal}`, text, [card]);
  return { ok: true, text, cards: [card], card, changed: false };
}
