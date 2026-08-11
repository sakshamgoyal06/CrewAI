import type { MealSlot } from "./parseMealLogCommand.js";
import type { PillarExecutionPlan } from "../agents/routing/pillarStrategy/types.js";

export type FullDayMealSegment = {
  text: string;
  slot: MealSlot;
  logKind: "meal" | "snack" | "drink";
};

const BREAKFAST_LEAD_RE =
  /^(?:for\s+)?breakfast(?:\s+today|\s+this\s+morning)?\s*(?:i\s+)?(?:just\s+)?(?:had|ate|only\s+had|was)\s+(?:a\s+|an\s+|some\s+)?/i;
const LUNCH_LEAD_RE =
  /^(?:for\s+)?lunch(?:\s+today)?\s*(?:i\s+)?(?:had|ate|was)\s+(?:a\s+|an\s+|some\s+)?/i;
const DINNER_LEAD_RE =
  /^(?:for\s+)?dinner(?:\s+today|tonight)?\s*(?:i\s+)?(?:had|ate|was|will\s+be)\s+(?:a\s+|an\s+|some\s+)?/i;
const SNACK_LEAD_RE =
  /^(?:then|also|and\s+then|later)\s+(?:i\s+)?(?:had|ate|just\s+had)?\s*(?:a\s+|an\s+)?/i;
const ANOTHER_TEA_RE = /^(?:then|also|and\s+then)\s+(?:another|a)\s+tea\b/i;

/** User recounts what they ate across multiple meals in one message (replace today's log, don't stack). */
export function isFullDayMealRecount(message: string): boolean {
  return splitFullDayMealRecountSegments(message).length >= 2;
}

function stripLead(re: RegExp, segment: string): string {
  return segment.replace(re, "").trim();
}

function slotForSegment(segment: string): {
  slot: MealSlot;
  logKind: FullDayMealSegment["logKind"];
  foodText: string;
} {
  const t = segment.trim();
  if (BREAKFAST_LEAD_RE.test(t)) {
    return {
      slot: "breakfast",
      logKind: "meal",
      foodText: stripLead(BREAKFAST_LEAD_RE, t),
    };
  }
  if (LUNCH_LEAD_RE.test(t)) {
    return {
      slot: "lunch",
      logKind: "meal",
      foodText: stripLead(LUNCH_LEAD_RE, t),
    };
  }
  if (DINNER_LEAD_RE.test(t)) {
    return {
      slot: "dinner",
      logKind: "meal",
      foodText: stripLead(DINNER_LEAD_RE, t),
    };
  }
  if (ANOTHER_TEA_RE.test(t)) {
    return { slot: "snack", logKind: "drink", foodText: "tea" };
  }
  if (SNACK_LEAD_RE.test(t)) {
    const food = stripLead(SNACK_LEAD_RE, t);
    const isDrink = /\b(?:tea|coffee|chai|latte|juice|smoothie|shake)\b/i.test(food);
    return {
      slot: "snack",
      logKind: isDrink ? "drink" : "snack",
      foodText: food,
    };
  }
  return { slot: "unspecified", logKind: "meal", foodText: t };
}

/**
 * Split a multi-meal day narrative into one segment per eating occasion.
 * Handles newline-separated "For breakfast… / For lunch… / Then another tea" patterns.
 */
export function splitFullDayMealRecountSegments(message: string): FullDayMealSegment[] {
  const trimmed = message.trim();
  if (!trimmed) {
    return [];
  }

  const chunks = trimmed
    .split(/\n+/)
    .flatMap((line) =>
      line
        .split(/(?=\bfor\s+(?:breakfast|lunch|dinner)\b)/i)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    )
    .flatMap((chunk) => {
      const anotherTea = chunk.match(
        /^(.*?)(?=(?:then|also|and\s+then)\s+(?:another|a)\s+tea\b)/is,
      );
      if (anotherTea?.[1]?.trim() && anotherTea[1]!.trim().length > 0) {
        const rest = chunk.slice(anotherTea[1]!.length).trim();
        const out = [anotherTea[1]!.trim()];
        if (rest.length > 0) {
          out.push(rest);
        }
        return out;
      }
      return [chunk];
    })
    .filter((s) => s.length > 2);

  if (chunks.length < 2) {
    return [];
  }

  const segments: FullDayMealSegment[] = [];
  for (const chunk of chunks) {
    const { slot, logKind, foodText } = slotForSegment(chunk);
    const text = foodText.replace(/[.!?]+$/, "").trim();
    if (text.length < 2) {
      continue;
    }
    segments.push({ text, slot, logKind });
  }

  return segments.length >= 2 ? segments : [];
}

/** Deterministic multi-step plan for a full-day eating recount (replaces stacked logs). */
export function buildFullDayMealRecountPlan(message: string): PillarExecutionPlan | null {
  const segments = splitFullDayMealRecountSegments(message);
  if (segments.length < 2) {
    return null;
  }
  return {
    confidence: 1,
    parser: "deterministic",
    steps: segments.map((seg) => ({
      capability: "meal_log",
      args: {
        meal_text: seg.text,
        meal_slot: seg.slot,
        log_kind: seg.logKind,
      },
      intent_summary: seg.text,
    })),
  };
}
