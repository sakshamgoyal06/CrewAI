import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, anthropic: {} }));

import { cardAt, isDayClosed, openDayAt } from "./cardDay.js";
import { closedLabel, cardHistoryNote, emptyCardStates, hydrateCard, mealDaysOf, type CardStates } from "./chatCards.js";
import type { ChatCard } from "./chat.js";
import { pickCarriedCheck } from "./dailyChat.js";
import { refreshPlan } from "./interventions/engine.js";
import type { Finding, Intervention } from "./interventions/types.js";

const IST = "Asia/Kolkata";
/** A local IST clock time as an instant. */
const ist = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`);

describe("when a card's day closes", () => {
  it("stays open through the night and closes at 05:00", () => {
    expect(openDayAt(ist("2026-11-08", "00:30"), IST)).toBe("2026-11-07");
    expect(openDayAt(ist("2026-11-08", "04:59"), IST)).toBe("2026-11-07");
    expect(openDayAt(ist("2026-11-08", "05:00"), IST)).toBe("2026-11-08");
    expect(isDayClosed("2026-11-07", ist("2026-11-08", "04:59"), IST)).toBe(false);
    expect(isDayClosed("2026-11-07", ist("2026-11-08", "05:00"), IST)).toBe(true);
    expect(isDayClosed("2026-11-08", ist("2026-11-08", "23:59"), IST)).toBe(false);
  });

  it("dates a card in the person's timezone", () => {
    // 23:40 IST on 7 Nov is 18:10 UTC.
    expect(cardAt("2026-11-07T18:10:00Z", IST, ist("2026-11-08", "07:00"))).toEqual({ date: "2026-11-07", closed: true });
    expect(cardAt("2026-11-07T18:10:00Z", IST, ist("2026-11-08", "00:20"))).toEqual({ date: "2026-11-07", closed: false });
    expect(cardAt(undefined, IST, new Date())).toBeUndefined();
  });
});

const lunch = (draftId: string, extra: Record<string, unknown> = {}): Extract<ChatCard, { type: "meal_draft" }> => ({
  type: "meal_draft",
  draft: { draftId, text: "Rajma chawal", slot: "lunch", source: "food_db", items: [], totals: { calories: 620, protein_g: 20, carbs_g: 90, fat_g: 12 }, estimated: true, servingAssumption: null, ...extra },
});
const closed = { date: "2026-11-07", closed: true };
const open = { date: "2026-11-08", closed: false };

function states(fill: (s: CardStates) => void = () => {}): CardStates {
  const s = emptyCardStates();
  fill(s);
  return s;
}

describe("closed cards read their ending from the logs", () => {
  it("a meal card never confirmed, but lunch logged in the Meals tab, says so (not 'Not logged')", () => {
    const st = states((s) => s.slotLogs.set("2026-11-07|lunch", { calories: 640.4, sessions: new Set(["meals-tab"]) }));
    const shown = hydrateCard(lunch("chat-1"), st, closed);
    expect(shown.closed).toBe(true);
    expect(shown.closedLabel).toBe("Not logged from this card · Lunch logged separately (640 kcal)");
    // The coach is told the same, so it never calls lunch missing.
    const note = cardHistoryNote(lunch("chat-1"), st, closed);
    expect(note).toMatch(/lunch on 2026-11-07 was logged separately \(640 kcal\)/);
    expect(note).not.toMatch(/not logged\b(?! from)/i);
    expect(note).toMatch(/day is closed/);
  });

  it("says 'Not logged' only when the slot is empty that day", () => {
    expect(hydrateCard(lunch("chat-1"), states(), closed).closedLabel).toBe("Not logged");
    // Lunch logged on another day doesn't count.
    const other = states((s) => s.slotLogs.set("2026-11-08|lunch", { calories: 500, sessions: new Set(["x"]) }));
    expect(hydrateCard(lunch("chat-1"), other, closed).closedLabel).toBe("Not logged");
  });

  it("of two cards for one slot, the confirmed one shows as logged and the other doesn't claim its food was eaten", () => {
    const st = states((s) => {
      s.mealsLogged.set("chat-2", { calories: 640 });
      s.slotLogs.set("2026-11-07|lunch", { calories: 640, sessions: new Set(["chat-2"]) });
    });
    const confirmed = hydrateCard(lunch("chat-2"), st, closed);
    expect(confirmed.closed).toBeUndefined();
    expect(confirmed.type === "meal_draft" && confirmed.saved?.calories).toBe(640);
    expect(hydrateCard(lunch("chat-1"), st, closed).closedLabel).toMatch(/^Not logged from this card/);
  });

  it("follows a log added later from Past days: nothing about the ending is stored", () => {
    const before = hydrateCard(lunch("chat-1"), states(), closed);
    const after = hydrateCard(lunch("chat-1"), states((s) => s.slotLogs.set("2026-11-07|lunch", { calories: 300, sessions: new Set(["late"]) })), closed);
    expect(before.closedLabel).toBe("Not logged");
    expect(after.closedLabel).toMatch(/logged separately \(300 kcal\)/);
  });

  it("leaves today's cards open with their buttons", () => {
    const shown = hydrateCard(lunch("chat-1"), states(), open);
    expect(shown.closed).toBeUndefined();
  });

  it("stamps a meal card with its day, so confirming it after midnight logs to that day", () => {
    const shown = hydrateCard(lunch("chat-1"), states(), { date: "2026-11-07", closed: false });
    expect(shown.type === "meal_draft" && shown.draft.date).toBe("2026-11-07");
    // A planned meal for another day keeps its own date.
    const planned = hydrateCard(lunch("chat-1", { date: "2026-11-06" }), states(), open);
    expect(planned.type === "meal_draft" && planned.draft.date).toBe("2026-11-06");
  });

  it("collects the days to look up from each meal card's own day", () => {
    const at = (c?: string) => (c === "a" ? closed : c === "b" ? open : undefined);
    expect(mealDaysOf([{ cards: [lunch("1")], createdAt: "a" }, { cards: [lunch("2", { date: "2026-11-05" })], createdAt: "b" }, { cards: [] }], at).sort()).toEqual(["2026-11-05", "2026-11-07"]);
  });

  it("closes unanswered checks, proposals and offers; leaves answered and info cards alone", () => {
    const st = emptyCardStates();
    const gym: ChatCard = { type: "workout_check", date: "2026-11-07", gymTime: "18:30", status: "missing" };
    expect(closedLabel(gym, st, closed)).toBe("Not logged");
    expect(closedLabel({ ...gym, status: "found" }, st, closed)).toBeNull();
    const walk: ChatCard = { type: "routine_check", itemId: "w", date: "2026-11-07", label: "Morning walk", activityKey: "walk", startTime: "07:00", durationMin: 30, status: "missing" };
    expect(closedLabel(walk, st, closed)).toBe("Not logged");
    expect(closedLabel({ ...walk, status: "skipped" }, st, closed)).toBeNull();
    const hevy = { type: "hevy_proposal", proposalId: "p", kind: "routine_update", title: "Push day", reason: null, lines: [], status: "pending", error: null } as unknown as ChatCard;
    expect(closedLabel(hevy, st, closed)).toBe("Expired, not applied in Hevy");
    const offer = { type: "intervention", interventionId: "i", status: "offered" } as unknown as ChatCard;
    expect(closedLabel(offer, st, closed)).toMatch(/today's plan/);
    expect(closedLabel({ ...offer, status: "trial" } as ChatCard, st, closed)).toBeNull();
    expect(closedLabel({ type: "day_plan" } as unknown as ChatCard, st, closed)).toBeNull();
    expect(closedLabel({ type: "log_receipt" } as unknown as ChatCard, st, closed)).toBeNull();
  });
});

describe("the next morning", () => {
  const gym = (status: string): ChatCard => ({ type: "workout_check", date: "2026-11-07", gymTime: "18:30", status } as ChatCard);
  const walk = (status: string): ChatCard => ({ type: "routine_check", itemId: "w", date: "2026-11-07", label: "Morning walk", activityKey: "walk", startTime: "07:00", durationMin: 30, status } as ChatCard);
  const isMissing = (c: ChatCard) => (c as { status: string }).status === "missing";

  it("asks at most one thing from yesterday, the gym first", () => {
    expect(pickCarriedCheck([walk("missing"), gym("missing")], "2026-11-07", isMissing)?.type).toBe("workout_check");
    expect(pickCarriedCheck([walk("missing"), gym("found")], "2026-11-07", isMissing)?.type).toBe("routine_check");
    expect(pickCarriedCheck([walk("done"), gym("found")], "2026-11-07", isMissing)).toBeNull();
    // Only yesterday's checks.
    expect(pickCarriedCheck([{ ...walk("missing"), date: "2026-11-06" } as ChatCard], "2026-11-07", isMissing)).toBeNull();
  });

  const offer = (p: Partial<Intervention>): Intervention => ({
    id: "i", pattern: "over_ambitious", cause: "pace", area: "goal", itemId: null, itemLabel: null, localDate: "2026-11-04", title: "", evidence: [], facts: {}, options: [],
    recommendation: null, status: "offered", chosenOption: null, before: null, applied: null, deferred: null, baseline: null, reviewOn: null, verdict: null, createdAt: "", answeredAt: null, startedAt: null, closedAt: null, ...p,
  });
  const finding = (p: Partial<Finding>): Finding => ({ pattern: "over_ambitious", cause: "pace", area: "goal", itemId: null, itemLabel: null, weight: 5, evidence: ["Reaching 113 kg by 2027-01-01 …"], facts: {}, ...p });

  it("rebuilds an old goal offer from today's goal, or closes it when the new goal is fine", () => {
    const old = offer({ evidence: ["Reaching 88 kg by 2027-05-04 needs 1.16 kg a week"] });
    const [rebuilt] = refreshPlan([old], [finding({})]);
    expect(rebuilt!.finding?.evidence[0]).toMatch(/113 kg/);
    const [closedOne] = refreshPlan([old], []);
    expect(closedOne!.finding).toBeNull();
  });

  it("matches a routine offer only to the same item", () => {
    const slip = offer({ pattern: "routine_slipping", area: "routine:g1", itemId: "g1" });
    expect(refreshPlan([slip], [finding({ pattern: "routine_slipping", area: "routine:g2", itemId: "g2" })])[0]!.finding).toBeNull();
    expect(refreshPlan([slip], [finding({ pattern: "routine_slipping", area: "routine:g1", itemId: "g1" })])[0]!.finding).not.toBeNull();
  });
});
