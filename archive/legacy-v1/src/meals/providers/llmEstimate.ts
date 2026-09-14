import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic } from "../../tools/clients.js";
import type { MealNutritionEstimate } from "../types.js";

const MODEL = "claude-sonnet-4-6";

const SYSTEM = `You estimate nutrition for a free-text meal description. Reply with **only** a single JSON object, no markdown, no prose.
Schema:
{"calories":number|null,"protein_g":number|null,"carbs_g":number|null,"fat_g":number|null,"items":[{"name":string,"calories":number|null}]}
Use reasonable averages for Indian and international foods when quantities are vague. If impossible to guess, use null for numbers.`;

function textFromMessage(msg: Message): string {
  for (const block of msg.content) {
    if (block.type === "text") {
      return block.text;
    }
  }
  return "";
}

export async function estimateViaLlm(query: string): Promise<MealNutritionEstimate | null> {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: SYSTEM,
    messages: [{ role: "user", content: query }],
  });
  const raw = textFromMessage(msg).trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }

  const calories = numOrNull(parsed.calories);
  const itemsRaw = Array.isArray(parsed.items) ? parsed.items : [];
  const items = itemsRaw.map((row) => {
    const o = row as Record<string, unknown>;
    return {
      name: String(o.name ?? "item"),
      calories: numOrNull(o.calories) ?? undefined,
    };
  });

  return {
    calories,
    protein_g: numOrNull(parsed.protein_g),
    carbs_g: numOrNull(parsed.carbs_g),
    fat_g: numOrNull(parsed.fat_g),
    items: items.length > 0 ? items : [{ name: query.slice(0, 80), calories: calories ?? undefined }],
    source: "llm_estimate",
    providerRaw: { model: MODEL, raw },
  };
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) {
    return null;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
