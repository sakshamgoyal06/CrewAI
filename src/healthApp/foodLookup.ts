/**
 * "Can't find it? Search": a food the database doesn't have is looked up on the web (paid). The
 * text goes to a model and a web search, so it is checked first and nothing that isn't a food
 * name gets through (OWASP LLM01 prompt injection, LLM10 unbounded consumption). What comes back
 * is cleaned before the app shows it: short plain names and numbers in a sane range. The meal is
 * still only saved when the person approves and confirms it, and web foods stay private to them
 * until vetted (foodStore.ts).
 */
import type { MealItem } from "./meals.js";

export const LOOKUP_MAX_CHARS = 120;
const MAX_WORDS = 20;

/** Phrases that address the model instead of naming a food. */
const INSTRUCTION =
  /\b(?:ignore|disregard|forget)\b.{0,20}\b(?:previous|above|prior|earlier|all|instructions?|rules?)\b|\bsystem\s*prompt\b|\b(?:you are|you're|act as|pretend|roleplay|jailbreak|developer mode|instructions?|prompt|assistant|chatgpt|claude|openai|anthropic)\b|\b(?:api[\s_-]?key|password|token|secret|credential)s?\b|\b(?:select|insert|update|delete|drop)\b.{0,30}\b(?:from|into|table|set)\b|\b(?:script|javascript|eval|exec|sudo|curl|wget)\b/i;
const LINK = /(?:https?:|ftp:|www\.|\b[\w-]+\.(?:com|net|org|io|in|ai|dev|app|xyz|co)\b|@\w)/i;
/** Letters (any script), digits, spaces and the punctuation food names use: 1/2 cup, 2% milk, Haldiram's, salt & pepper. */
const FOOD_CHARS = /^[\p{L}\p{M}\p{N}\s.,'’&%/()+×½¼¾-]+$/u;

export type FoodQueryCheck = { ok: true; text: string } | { ok: false; error: "not_a_food" };

/** A food name and amount, or a refusal. Pure. */
export function checkFoodQuery(raw: string): FoodQueryCheck {
  const text = raw.replace(/\s+/g, " ").trim();
  const bad = { ok: false, error: "not_a_food" } as const;
  if (text.length < 2 || text.length > LOOKUP_MAX_CHARS) return bad;
  if (!/\p{L}/u.test(text)) return bad;
  if (!FOOD_CHARS.test(text)) return bad;
  if (LINK.test(text) || INSTRUCTION.test(text)) return bad;
  if (text.split(" ").length > MAX_WORDS) return bad;
  return { ok: true, text };
}

const clamp = (n: unknown, max: number) => {
  const v = typeof n === "number" && Number.isFinite(n) ? n : Number(n);
  return Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v * 10) / 10)) : 0;
};

/** Items fit to show and log: plain short names, numbers in range, empty lines dropped. Pure. */
export function cleanLookupItems(items: MealItem[]): MealItem[] {
  return items
    .map((i) => ({
      name: String(i.name ?? "")
        .replace(/[\u0000-\u001f\u007f<>{}`$\\|]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80),
      calories: Math.round(clamp(i.calories, 3000)),
      protein_g: clamp(i.protein_g, 300),
      carbs_g: clamp(i.carbs_g, 500),
      fat_g: clamp(i.fat_g, 300),
    }))
    .filter((i) => i.name.length > 0 && i.calories > 0)
    .slice(0, 12);
}
