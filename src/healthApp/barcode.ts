/**
 * Packaged food by barcode: look the product up on Open Food Facts and turn its label into the
 * same editable meal draft card as a typed or photographed meal.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getLocalTimeParts } from "../nutrition/localDate.js";
import { logger } from "../logger.js";
import { resolveTimezone } from "../nutrition/localDate.js";
import type { ActionContext } from "./actions.js";
import { recordChatTurn, type ChatReply } from "./chat.js";
import { MEAL_SLOTS, slotForLocalHour, sumItems, type MealDraft } from "./meals.js";

export const barcodeInput = z.object({
  code: z.string().trim().regex(/^\d{8,14}$/, "expected an 8 to 14 digit barcode"),
  /** How much was eaten, in grams or ml. Defaults to one serving from the label. */
  grams: z.number().positive().max(5000).optional(),
  servings: z.number().positive().max(20).optional(),
  slot: z.enum(MEAL_SLOTS).optional(),
});
export type BarcodeInput = z.infer<typeof barcodeInput>;

/** The label, per 100 g (or ml), plus the serving it states. */
export type BarcodeProduct = {
  code: string;
  name: string;
  brand: string | null;
  per100: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  servingGrams: number | null;
  servingLabel: string | null;
  packGrams: number | null;
};

type Fetch = typeof fetch;

const OFF_FIELDS = "product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,product_quantity";
const cache = new Map<string, BarcodeProduct | null>();
const CACHE_MAX = 2000;

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Open Food Facts product JSON → our label shape. Null when it lacks calories. */
export function parseOffProduct(code: string, product: Record<string, unknown>): BarcodeProduct | null {
  const n = (product.nutriments ?? {}) as Record<string, unknown>;
  const kj = num(n["energy_100g"]);
  const kcal = num(n["energy-kcal_100g"]) ?? (kj !== null ? kj / 4.184 : null);
  if (kcal === null) return null;
  const name = String(product.product_name_en || product.product_name || "").trim();
  const brand = String(product.brands ?? "").split(",")[0]?.trim() || null;
  const servingGrams = num(product.serving_quantity);
  return {
    code,
    name: name || (brand ? `${brand} product` : "Packaged food"),
    brand,
    per100: {
      calories: kcal,
      protein_g: num(n["proteins_100g"]) ?? 0,
      carbs_g: num(n["carbohydrates_100g"]) ?? 0,
      fat_g: num(n["fat_100g"]) ?? 0,
    },
    servingGrams: servingGrams && servingGrams > 0 ? servingGrams : null,
    servingLabel: typeof product.serving_size === "string" && product.serving_size.trim() ? product.serving_size.trim() : null,
    packGrams: num(product.product_quantity) || null,
  };
}

export async function lookupBarcode(code: string, fetchImpl: Fetch = fetch): Promise<BarcodeProduct | null> {
  if (cache.has(code)) return cache.get(code) ?? null;
  const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}`;
  let found: BarcodeProduct | null = null;
  try {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": "Magnus/1.0 (health coach app; https://crewai-production-c221.up.railway.app)" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) {
      found = null;
    } else if (!res.ok) {
      // Don't cache outages: the same code may work in a minute.
      throw new Error(`open food facts ${res.status}`);
    } else {
      const body = (await res.json()) as { status?: number; product?: Record<string, unknown> };
      found = body.status === 1 && body.product ? parseOffProduct(code, body.product) : null;
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message, code }, "barcode lookup failed");
    throw err;
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(code, found);
  return found;
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

/** How much was eaten: grams if given, else servings × the label's serving, else 100 g. */
export function portionGrams(p: BarcodeProduct, input: Pick<BarcodeInput, "grams" | "servings">): { grams: number; assumption: string | null } {
  if (input.grams) return { grams: input.grams, assumption: null };
  const servings = input.servings ?? 1;
  if (p.servingGrams) {
    const label = p.servingLabel ? ` (${p.servingLabel})` : "";
    return {
      grams: p.servingGrams * servings,
      assumption: input.servings ? null : `Assumed one serving${label} from the label. Change the amount if you had more.`,
    };
  }
  return { grams: 100 * servings, assumption: "The label has no serving size, so this is 100 g. Change it to what you had." };
}

export function draftFromProduct(p: BarcodeProduct, input: BarcodeInput, slot: MealDraft["slot"]): MealDraft {
  const { grams, assumption } = portionGrams(p, input);
  const f = grams / 100;
  const amount = `${Math.round(grams)} g`;
  const title = p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? `${p.brand} ${p.name}` : p.name;
  const items = [
    {
      name: `${title}, ${amount}`,
      calories: Math.round(p.per100.calories * f),
      protein_g: r1(p.per100.protein_g * f),
      carbs_g: r1(p.per100.carbs_g * f),
      fat_g: r1(p.per100.fat_g * f),
    },
  ];
  return {
    draftId: randomUUID(),
    text: `${title}, ${amount}`,
    slot,
    // Label values are database values, not estimates; no migration needed for a new source.
    source: "food_db",
    items,
    totals: sumItems(items),
    estimated: true,
    servingAssumption: assumption,
  };
}

export function barcodeReplyText(draft: MealDraft): string {
  return `From the label: about ${draft.totals.calories} kcal and ${Math.round(draft.totals.protein_g)} g protein. Check the amount on the card, then tap Confirm & log.`;
}

export type BarcodeResult =
  | ({ ok: true; product: BarcodeProduct } & ChatReply)
  | { ok: false; error: "barcode_not_found" | "barcode_lookup_failed" };

export async function draftMealFromBarcode(
  ctx: ActionContext,
  input: BarcodeInput,
  deps: { lookup?: typeof lookupBarcode; record?: typeof recordChatTurn } = {},
): Promise<BarcodeResult> {
  let product: BarcodeProduct | null;
  try {
    product = await (deps.lookup ?? lookupBarcode)(input.code);
  } catch {
    return { ok: false, error: "barcode_lookup_failed" };
  }
  if (!product) return { ok: false, error: "barcode_not_found" };
  const local = getLocalTimeParts(ctx.now ?? new Date(), resolveTimezone(ctx.timezone));
  const slot = input.slot ?? slotForLocalHour(local.hour);
  const draft: MealDraft = { ...draftFromProduct(product, input, slot), date: local.dateKey };
  const text = barcodeReplyText(draft);
  const cards = [{ type: "meal_draft" as const, draft }];
  await (deps.record ?? recordChatTurn)(ctx.userProfileId, `▥ Scanned: ${product.name}`, text, cards);
  return { ok: true, product, text, cards, changed: false };
}

export function _clearBarcodeCache(): void {
  cache.clear();
}
