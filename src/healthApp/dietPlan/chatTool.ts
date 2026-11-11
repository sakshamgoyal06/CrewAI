/**
 * The coach's one tool for the meal plan: see a day, eat a planned meal, swap it for another
 * option, pin / like / hide an option, or rebuild the options. Meals they ate that aren't the
 * plan go through draft_meal as usual; the plan adjusts itself after (rhythm.ts).
 */
import { z } from "zod";

import { localDateKey } from "../../nutrition/localDate.js";
import type { ActionContext } from "../actions.js";
import { loadPlanEntries } from "../dayMealsStore.js";
import { eatPlanned, skipPlanned } from "./log.js";
import { confirmDayComplete, mealsOn, planMealCard, planViewOrNull, rebalanceToday, redoCarry, type PlanMealCard } from "./rhythm.js";
import { addDays } from "../../util/time.js";
import { PERIOD_DIETS } from "./dietPeriod.js";
import { changeAvoidList, markOption, rebuildPlan, setDietPeriod, swapPick } from "./store.js";
import { PLAN_SLOTS } from "./targets.js";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const mealPlanInput = z.object({
  action: z.enum(["view", "ate", "swap", "pin", "unpin", "like", "hide", "rebuild", "diet_period", "avoid", "unavoid", "day_complete", "skip", "ate_rest"]),
  date: DATE.optional(),
  slot: z.enum(PLAN_SLOTS).optional(),
  optionId: z.string().max(64).optional(),
  /** diet_period: the temporary diet, and for how long (days from today, or the last date). Omit diet to end it. */
  diet: z.enum(PERIOD_DIETS).optional(),
  /** diet_period: foods out for the period; avoid / unavoid: foods for the lasting avoid list. */
  foods: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  days: z.coerce.number().int().min(1).max(120).optional(),
  until: DATE.optional(),
});

export const MEAL_PLAN_TOOL = {
  name: "meal_plan",
  description:
    "Their meal plan (Meals tab). view: a day's planned meals (default today), with swap options when slot is given. ate: they ate a planned meal as planned (date, slot); logs it, no card to confirm. swap: replace a planned meal with another option of that meal (optionId from view). pin / unpin / like / hide: an option (optionId); hide never offers it again. rebuild: fresh options for every meal (replaces meals they edited too). diet_period: a rule for a while (veg only for 20 days, no sweets this week): diet (vegetarian = no egg, eggetarian, vegan, jain) and/or foods, with days or until; with neither diet nor foods it ends the running one. avoid / unavoid: foods (an allergy, a food they won't eat) added to or taken off their lasting avoid list. diet_period, avoid and unavoid re-plan every planned meal that breaks the rule and return the plan as it is now: describe only that, name the meals replaced, and say so if violations is above 0. day_complete: an earlier day (date) whose day close said a meal wasn't logged, and they say that was all they ate; it then counts as logged in full and the next days are balanced. skip: they did NOT eat a planned meal (date, slot), for any reason (fasting, no appetite, travelling); it counts as 0 kcal. Only call it when they say they skipped it or ate nothing then; a meal they just didn't mention is unlogged, never skipped. ate_rest: they ate the rest of a day's planned meals roughly as planned (date; today or an earlier day): logs every meal of that day still planned, in one go. The quickest way to catch up a day. Ate something other than the plan: use draft_meal instead.",
  input_schema: {
    type: "object" as const,
    properties: {
      action: { type: "string", enum: ["view", "ate", "swap", "pin", "unpin", "like", "hide", "rebuild", "diet_period", "avoid", "unavoid", "day_complete", "skip", "ate_rest"] },
      diet: { type: "string", enum: [...PERIOD_DIETS] },
      foods: { type: "array", items: { type: "string" }, description: "Food names, e.g. ['peanuts'] or ['mushroom', 'brinjal']." },
      days: { type: "integer", description: "diet_period: how many days from today, today included." },
      until: { type: "string", description: "diet_period: last date YYYY-MM-DD, instead of days." },
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
      // They told the coach they ate it: no "it's early" check.
      const r = await eatPlanned(ctx, date, input.slot!, { early: true });
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
    case "diet_period": {
      const until = input.until ?? (input.days ? addDays(date, input.days - 1) : undefined);
      if ((input.diet || input.foods?.length) && !until) return { result: { ok: false, error: "days_or_until_required" } };
      const r = await setDietPeriod(ctx, { diet: input.diet ?? null, avoid: input.foods, until }, now);
      return { result: r, changed: r.ok };
    }
    case "avoid":
    case "unavoid": {
      if (!input.foods?.length) return { result: { ok: false, error: "foods_required" } };
      const r = await changeAvoidList(ctx, input.action === "avoid" ? { add: input.foods } : { remove: input.foods }, now);
      return { result: r, changed: r.ok };
    }
    case "day_complete": {
      if (!input.date) return { result: { ok: false, error: "date_required" } };
      const r = await confirmDayComplete(ctx, input.date, now);
      return { result: r, changed: r.ok };
    }
    case "skip": {
      const miss = needSlot();
      if (miss) return miss;
      const r = await skipPlanned(ctx, date, input.slot!);
      if (r.ok) {
        if (date === localDateKey(now, ctx.timezone)) await rebalanceToday(ctx, now).catch(() => false);
        else await redoCarry(ctx, date, now).catch(() => false);
      }
      return { result: r, changed: r.ok };
    }
    case "ate_rest": {
      if (date > localDateKey(now, ctx.timezone)) return { result: { ok: false, error: "future_date" } };
      const plan = await loadPlanEntries(ctx.userProfileId, date, date);
      const open = (plan?.byDate.get(date) ?? []).filter((e) => e.status === "planned" && e.kind === "option");
      const logged: string[] = [];
      for (const e of open) {
        const r = await eatPlanned(ctx, date, e.slot, { early: true });
        if (r.ok) logged.push(e.slot);
      }
      if (logged.length && date < localDateKey(now, ctx.timezone)) await redoCarry(ctx, date, now).catch(() => false);
      return { result: { ok: true, date, logged, note: logged.length ? undefined : "Nothing left planned on that day." }, changed: logged.length > 0 };
    }
    case "rebuild": {
      const r = await rebuildPlan(ctx, "chat", now);
      return { result: r.ok ? { ok: true, note: "New options from tomorrow; today stays as it is." } : r, changed: r.ok };
    }
  }
}
