/**
 * Build a shopping list from locked meal plan entries for a date range.
 */
import { anthropic } from "../../tools/clients.js";
import { getPlanEntriesForRange } from "../store/mealPlanStore.js";
import { HEALTH_SPECIALIST_MODEL } from "../../agents/health/model.js";

const SHOPPING_SYSTEM = `You are Magnus helping with a grocery shopping list from a meal plan.

Given planned meals, output a concise markdown shopping list grouped by category (Produce, Protein, Dairy, Pantry, Frozen, Other).
- Merge duplicates; use sensible quantities when inferable from meal titles.
- No preamble — list only.
- Under 400 words.`;

export async function buildShoppingListForRange(input: {
  userProfileId: string;
  fromDate: string;
  toDate: string;
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const entries = await getPlanEntriesForRange(input.userProfileId, input.fromDate, input.toDate);
  const active = entries.filter((e) => e.status !== "skipped");
  if (!active.length) {
    return { ok: false, error: "no planned meals in that range — lock a plan first" };
  }

  const byDate = new Map<string, string[]>();
  for (const e of active) {
    const list = byDate.get(e.local_date) ?? [];
    list.push(`${e.meal_slot}: ${e.title}${e.description ? ` (${e.description})` : ""}`);
    byDate.set(e.local_date, list);
  }

  const planText = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, meals]) => `${date}\n${meals.map((m) => `  - ${m}`).join("\n")}`)
    .join("\n\n");

  const msg = await anthropic.messages.create({
    model: HEALTH_SPECIALIST_MODEL,
    max_tokens: 900,
    system: SHOPPING_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Meal plan ${input.fromDate} → ${input.toDate}:\n\n${planText}`,
      },
    ],
  });

  let text = "";
  for (const block of msg.content) {
    if (block.type === "text") {
      text += block.text;
    }
  }

  if (!text.trim()) {
    return { ok: false, error: "could not generate shopping list" };
  }

  return { ok: true, text: text.trim() };
}
