/**
 * "Took my supplements": logs the day's supplements (from the plan setup) as one entry on Today,
 * so their calories and protein count toward the day. One tap; undo removes it.
 */
import { randomUUID } from "node:crypto";

import { localDateKey } from "../../nutrition/localDate.js";
import type { ActionContext } from "../actions.js";
import { deleteMeal, saveConfirmedMeal } from "../meals.js";
import { loadDietPrefs, supplementSessionOn, SUPPLEMENTS_TEXT } from "./store.js";
import { supplementLines } from "./supplements.js";

export type SupplementLogResult =
  | { ok: true; alreadyLogged: boolean; kcal: number; proteinG: number }
  | { ok: false; error: "future_date" | "no_supplements" | string };

export async function logSupplements(ctx: ActionContext, date: string): Promise<SupplementLogResult> {
  if (date > localDateKey(ctx.now ?? new Date(), ctx.timezone)) return { ok: false, error: "future_date" };
  const { prefs } = await loadDietPrefs(ctx.userProfileId);
  const lines = supplementLines(prefs.supplements);
  if (!lines.length) return { ok: false, error: "no_supplements" };
  const kcal = lines.reduce((a, l) => a + l.kcal, 0);
  const proteinG = Math.round(lines.reduce((a, l) => a + l.proteinG, 0) * 10) / 10;
  if (await supplementSessionOn(ctx.userProfileId, date)) return { ok: true, alreadyLogged: true, kcal, proteinG };
  const saved = await saveConfirmedMeal(
    ctx.userProfileId,
    {
      draftId: randomUUID(),
      text: SUPPLEMENTS_TEXT,
      slot: "snack",
      source: "food_db",
      items: lines.map((l) => ({ name: `${l.text} ${l.name.toLowerCase()}`, calories: l.kcal, protein_g: l.proteinG, carbs_g: l.carbsG, fat_g: l.fatG })),
      edited: false,
      localDate: date,
    },
    ctx.now,
  );
  return saved.ok ? { ok: true, alreadyLogged: false, kcal, proteinG } : saved;
}

export async function undoSupplements(ctx: ActionContext, date: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await supplementSessionOn(ctx.userProfileId, date);
  if (!session) return { ok: false, error: "nothing_to_undo" };
  const r = await deleteMeal(ctx.userProfileId, session, ctx.timezone);
  return r.ok ? { ok: true } : r;
}
