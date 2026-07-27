import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { extractJsonObject } from "../../agents/health/jsonExtract.js";
import { HEALTH_SPECIALIST_MODEL } from "../../agents/health/model.js";
import { logger } from "../../logger.js";
import { anthropic } from "../../tools/clients.js";
import { mealLogAnthropicWebSearchEnabled } from "../mealEnv.js";
import type { MealItemLine, MealNutritionEstimate } from "../types.js";

/** Evidence comes only from the `web_search` server tool — no pre-fetched excerpts. */
const SYSTEM_ANTHROPIC_WEB = `You are a nutrition estimation assistant. The user gives one food / meal line (may include grams, counts, or brand names).

You **must** call the **web_search** tool at least once to find current nutrition, menu, or label data before you write JSON. Do not rely on memory alone for branded or restaurant items.

Rules:
- Prefer **brand / restaurant menu** numbers when the user names a chain or dish.
- If the user gave **grams** and web data is **per 100g** (or another basis), **scale** and say so in serving_assumption.
- If the user gave **counts** (e.g. 1 mini bowl) and the web gives **per mini**, use that; if only another size is listed, state what you assumed.
- If data conflicts, pick the most specific match and mention uncertainty briefly in serving_assumption.
- Never invent a brand number with no support from search results; use the closest generic estimate and say so.

After searching, output **nothing except** one raw JSON object: no markdown fences, no preamble ("Here is…"), no trailing commentary, no citation markers — the response body must start with { and end with }.

Shape:
{"calories":number,"protein_g":number,"carbs_g":number,"fat_g":number,"serving_assumption":string,"items":[{"name":string,"calories":number,"protein_g":number,"carbs_g":number,"fat_g":number,"portion_note"?:string}]}

serving_assumption: 1–4 short sentences on basis and inference.

items: one row per logical food, or one summary row for a single dish. Macros should sum consistently with top-level calories when possible.`;

function allTextFromMessage(msg: Message): string {
  const parts: string[] = [];
  for (const block of msg.content) {
    if (block.type === "text" && "text" in block) {
      parts.push(block.text);
    }
  }
  return parts.join("\n").trim();
}

function citationsFromAnthropicWebMessage(msg: Message): { title: string; url: string }[] {
  const out: { title: string; url: string }[] = [];
  for (const block of msg.content as unknown[]) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const b = block as Record<string, unknown>;
    if (b.type !== "web_search_tool_result" || !Array.isArray(b.content)) {
      continue;
    }
    for (const item of b.content) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const it = item as Record<string, unknown>;
      if (it.type === "web_search_result" && typeof it.url === "string") {
        const title = typeof it.title === "string" && it.title.trim() ? it.title.trim() : it.url;
        out.push({ title, url: it.url });
      }
    }
  }
  return out;
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

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function stripJsonFence(raw: string): string {
  const t = raw.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return m?.[1]?.trim() ?? t;
}

function parseEstimateJson(
  raw: string,
  q: string,
  providerRawBase: Record<string, unknown>,
): MealNutritionEstimate | null {
  const cleaned = stripJsonFence(raw.trim());
  let parsed: Record<string, unknown> | null = null;
  const extracted = extractJsonObject(cleaned);
  if (extracted && typeof extracted === "object" && !Array.isArray(extracted)) {
    parsed = extracted as Record<string, unknown>;
  } else {
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (!parsed) {
    return null;
  }

  const calories = numOrNull(parsed.calories);
  const protein_g = numOrNull(parsed.protein_g);
  const carbs_g = numOrNull(parsed.carbs_g);
  const fat_g = numOrNull(parsed.fat_g);
  const serving_assumption =
    typeof parsed.serving_assumption === "string" ? parsed.serving_assumption.trim() : "";

  if (calories === null || calories < 0) {
    return null;
  }

  const itemsRaw = Array.isArray(parsed.items) ? parsed.items : [];
  const items: MealItemLine[] = itemsRaw.map((row) => {
    const o = row as Record<string, unknown>;
    const portion_note =
      typeof o.portion_note === "string" && o.portion_note.trim()
        ? o.portion_note.trim()
        : undefined;
    return {
      name: String(o.name ?? q.slice(0, 120)),
      calories: numOrNull(o.calories) ?? undefined,
      protein_g: numOrNull(o.protein_g) ?? undefined,
      carbs_g: numOrNull(o.carbs_g) ?? undefined,
      fat_g: numOrNull(o.fat_g) ?? undefined,
      portion_note,
    };
  });

  const finalItems =
    items.length > 0
      ? items
      : [
          {
            name: q.slice(0, 120),
            calories: calories ?? undefined,
            protein_g: protein_g ?? undefined,
            carbs_g: carbs_g ?? undefined,
            fat_g: fat_g ?? undefined,
          },
        ];

  return {
    calories: round1(calories),
    protein_g: protein_g !== null ? round1(protein_g) : null,
    carbs_g: carbs_g !== null ? round1(carbs_g) : null,
    fat_g: fat_g !== null ? round1(fat_g) : null,
    items: finalItems,
    source: "web_research",
    serving_assumption: serving_assumption.length > 0 ? serving_assumption : null,
    providerRaw: {
      ...providerRawBase,
      model: HEALTH_SPECIALIST_MODEL,
      raw_response: raw.length > 4000 ? `${raw.slice(0, 4000)}…` : raw,
    },
  };
}

/**
 * Anthropic server **web_search** tool (real-time web), then structured JSON. No SerpAPI.
 * Returns null if disabled, API errors, or JSON parse fails. Org must allow web search in Console.
 */
async function estimateViaAnthropicWebSearch(query: string): Promise<MealNutritionEstimate | null> {
  const q = query.trim();
  if (!q || !mealLogAnthropicWebSearchEnabled()) {
    return null;
  }

  const userContent = `Food / meal line to estimate:\n${q}\n\nReply with **only** one JSON object as specified in the system message (no markdown fences).`;

  try {
    const msg = await anthropic.messages.create({
      model: HEALTH_SPECIALIST_MODEL,
      max_tokens: 2048,
      system: SYSTEM_ANTHROPIC_WEB,
      messages: [{ role: "user", content: userContent }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    } as unknown as Parameters<(typeof anthropic)["messages"]["create"]>[0]);

    const raw = stripJsonFence(allTextFromMessage(msg as Message).trim());
    const citationMeta = citationsFromAnthropicWebMessage(msg as Message);
    const webReqs =
      (msg as { usage?: { server_tool_use?: { web_search_requests?: number } } }).usage
        ?.server_tool_use?.web_search_requests ?? null;

    const parsed = parseEstimateJson(raw, q, {
      search_provider: "anthropic_web_search",
      web_search_requests: webReqs,
      citations: citationMeta,
    });
    if (!parsed) {
      logger.warn(
        { querySnippet: q.slice(0, 120), contentTypes: (msg as Message).content.map((b) => b.type) },
        "meal web research: Anthropic web_search JSON parse failed",
      );
    }
    return parsed;
  } catch (err) {
    logger.warn(
      { err: String(err), querySnippet: q.slice(0, 120) },
      "meal web research: Anthropic web_search request failed",
    );
    return null;
  }
}

/** Web-first estimate via the Anthropic `web_search` server tool. */
export async function estimateViaWebResearch(query: string): Promise<MealNutritionEstimate | null> {
  const q = query.trim();
  if (!q) {
    return null;
  }

  if (!mealLogAnthropicWebSearchEnabled()) {
    return null;
  }

  logger.debug({ querySnippet: q.slice(0, 100) }, "meal web research via Anthropic web_search");
  return estimateViaAnthropicWebSearch(q);
}
