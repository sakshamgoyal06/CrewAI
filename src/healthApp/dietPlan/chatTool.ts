/**
 * The coach's one tool for the meal plan: see a day, eat a planned meal, swap it for another
 * option, pin / like / hide an option, or rebuild the options. Meals they ate that aren't the
 * plan go through draft_meal as usual; the plan adjusts itself after (rhythm.ts).
 */
import { z } from "zod";

import { localDateKey } from "../../nutrition/localDate.js";
import type { ActionContext } from "../actions.js";
import { eatPlanned } from "./log.js";
import { mealsOn, planMealCard, planViewOrNull, rebalanceToday, type PlanMealCard } from "./rhythm.js";
import { markOption, rebuildPlan, swapPick } from "./store.js";
import { PLAN_SLOTS } from "./targets.js";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const mealPlanInput = z.object({
  action: z.enum(["view", "ate", "swap", "pin", "unpin", "like", "hide", "rebuild"]),
  date: DATE.optional(),
  slot: z.enum(PLAN_SLOTS).optional(),
  optionId: z.string().max(64).optional(),
});

export const MEAL_PLAN_TOOL = {
  name: "meal_plan",
  description:
    "Their meal plan (Meals tab). view: a day's planned meals (default today), with swap options when slot is given. ate: they ate a planned meal as planned (date, slot); logs it, no card to confirm. swap: replace a planned meal with another option of that meal (optionId from view). pin / unpin / like / hide: an option (optionId); hide never offers it again. rebuild: fresh options for every meal. Ate something other than the plan: use draft_meal instead.",
  input_schema: {
    type: "object" as const,
    properties: {
      action: { type: "string", enum: ["view", "ate", "swap", "pin", "unpin", "like", "hide", "rebuild"] },
      date: { type: "string", description: "YYYY-MM-DD; defaults to today." },
      slot: { type: "string", enum: [...PLAN_SLOTS] },
      optionId: { type: "string" },
    },
    required: ["action"],
  },
};

const short = (n: number) => Math.round(n);

export async function runMealPlanTool(ctx: ActionContext, input: z.infer<typeof mealPlanInput>): Promise<{ result: unknown; card?: PlanMealCard; changed?: boolean }> {
  const now = ctx.now ?? new Date();
  const date = input.date ?? localDateKey(now, ctx.timezone);
  const view = await planViewOrNull(ctx, now);
  if (!view?.plan) return { result: { ok: false, error: "no_plan", hint: "They haven't set up meals yet: the Meals tab, Set up my meals." } };
  const needSlot = () => (input.slot ? null : { result: { ok: false, error: "slot_required" } });

  switch (input.action) {
    case "view": {
      const meals = mealsOn(view, date).map((m) => ({
        slot: m.slot,
        time: m.time,
        status: m.status,
        kind: m.kind,
        meal: m.kind === "eat_out" ? m.title : m.items.map((i) => i.text).join(", "),
        kcal: short(m.totals.kcal),
        proteinG: short(m.totals.proteinG),
      }));
      if (!meals.length) return { result: { ok: true, date, meals, note: "Only today and the next 2 days are planned." } };
      const options = input.slot
        ? (view.plan.options[input.slot] ?? [])
            .filter((o) => !view.marks.hidden.includes(o.id))
            .map((o) => ({ optionId: o.id, meal: o.items.map((i) => i.text).join(", "), kcal: short(o.totals.kcal), proteinG: short(o.totals.proteinG), pinned: view.marks.pinned.includes(o.id) || undefined }))
        : undefined;
      return { result: { ok: true, date, targets: { kcal: view.plan.targets.calories, proteinG: view.plan.targets.proteinG }, meals, ...(options ? { options } : {}) } };
    }
    case "ate": {
      const miss = needSlot();
      if (miss) return miss;
      const r = await eatPlanned(ctx, date, input.slot!, {});
      if (!r.ok) return { result: r };
      const after = await planViewOrNull(ctx, now);
      const m = after && mealsOn(after, date).find((x) => x.slot === input.slot);
      return { result: { ok: true, logged: true, kcal: r.totals.kcal, proteinG: short(r.totals.proteinG) }, changed: true, ...(m ? { card: { ...planMealCard(m).card, status: "logged" } } : {}) };
    }
    case "swap": {
      const miss = needSlot();
      if (miss) return miss;
      if (!input.optionId) return { result: { ok: false, error: "optionId_required", hint: "Call view with the slot for the options." } };
      const r = await swapPick(ctx, date, input.slot!, input.optionId);
      if (r.ok && date === localDateKey(now, ctx.timezone)) await rebalanceToday(ctx, now).catch(() => false);
      return { result: r, changed: r.ok };
    }
    case "pin":
    case "unpin":
    case "like":
    case "hide": {
      if (!input.optionId) return { result: { ok: false, error: "optionId_required" } };
      await markOption(ctx.userProfileId, input.optionId, input.action);
      return { result: { ok: true }, changed: true };
    }
    case "rebuild": {
      const r = await rebuildPlan(ctx, "chat", now);
      return { result: r.ok ? { ok: true, note: "New options from tomorrow; today stays as it is." } : r, changed: r.ok };
    }
  }
}
