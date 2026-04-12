import type { MealNutritionEstimate } from "../types.js";

/**
 * HealthifyMe does **not** publish a public nutrition API for third-party apps.
 * This client calls an **optional** HTTPS endpoint you control (e.g. a small bridge
 * that talks to internal systems or scrapes — you own compliance).
 *
 * Expected request: POST `HEALTHIFYME_PROXY_URL` with JSON `{ "query": "<meal text>" }`
 * Expected response JSON (flexible):
 *   { "calories": number, "protein_g"?: number, "carbs_g"?: number, "fat_g"?: number, "items"?: [...] }
 */
export async function estimateViaHealthifyMeProxy(
  query: string,
): Promise<MealNutritionEstimate | null> {
  const url = process.env.HEALTHIFYME_PROXY_URL?.trim();
  if (!url) {
    return null;
  }

  const token = process.env.HEALTHIFYME_PROXY_TOKEN?.trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    return null;
  }

  const data = (await res.json()) as Record<string, unknown>;
  const calories = toNum(data.calories);
  if (calories === null) {
    return null;
  }

  const items = Array.isArray(data.items) ? data.items : [];
  const normalizedItems = items.map((row) => {
    const o = row as Record<string, unknown>;
    return {
      name: String(o.name ?? "item"),
      calories: toNum(o.calories) ?? undefined,
      protein_g: toNum(o.protein_g) ?? undefined,
      carbs_g: toNum(o.carbs_g) ?? undefined,
      fat_g: toNum(o.fat_g) ?? undefined,
    };
  });

  return {
    calories,
    protein_g: toNum(data.protein_g),
    carbs_g: toNum(data.carbs_g),
    fat_g: toNum(data.fat_g),
    items:
      normalizedItems.length > 0
        ? normalizedItems
        : [{ name: query.slice(0, 120), calories: calories ?? undefined }],
    source: "healthifyme_proxy",
    providerRaw: data as Record<string, unknown>,
  };
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
