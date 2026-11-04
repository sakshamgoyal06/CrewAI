import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: string; user_profile_id: string; role: string; content: string; cards: unknown[]; turn_id: string | null; created_at: string };
const rows: Row[] = [];
let clock = 0;
const stamp = () => new Date(Date.UTC(2026, 10, 3, 8, 0, clock++)).toISOString();
/** Dates whose check the person already answered on the card. */
const answered = new Set<string>();

vi.mock("../tools/clients.js", () => {
  const query = (op: "select" | "update", patch?: Record<string, unknown>) => {
    const filters: Array<(r: Row) => boolean> = [];
    let limitN = Infinity;
    const run = () => {
      const hit = rows.filter((r) => filters.every((f) => f(r))).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limitN);
      if (op === "update") for (const r of hit) Object.assign(r, patch);
      return hit;
    };
    const q = {
      eq: (k: keyof Row, v: unknown) => { filters.push((r) => r[k] === v); return q; },
      order: () => q,
      limit: (n: number) => { limitN = n; return q; },
      then: (resolve: (v: unknown) => void) => resolve({ data: run(), error: null }),
    };
    return q;
  };
  return {
    supabase: { from: () => ({ select: () => query("select"), update: (patch: Record<string, unknown>) => query("update", patch) }) },
    anthropic: {},
  };
});
vi.mock("./workoutCheckStore.js", () => ({
  postCoachMessage: async (user_profile_id: string, content: string, cards: unknown[]) => {
    rows.push({ id: `r${rows.length + 1}`, user_profile_id, role: "assistant", content, cards, turn_id: null, created_at: stamp() });
  },
}));
vi.mock("./chatCards.js", () => ({
  loadCardStates: async () => ({}),
  hydrateCard: (c: { type: string; date?: string; status?: string }) => (c.date && answered.has(c.date) ? { ...c, status: "done" } : c),
}));

import { catchUpText, MAX_UNANSWERED, mergedCheckText, postCheck, type CheckCard } from "./coachInbox.js";

const walk = (date: string): CheckCard => ({ type: "routine_check", itemId: "walk", date, label: "Morning walk", activityKey: "walking", startTime: "07:00", durationMin: 30, status: "missing" });
const swim = (date: string): CheckCard => ({ type: "routine_check", itemId: "swim", date, label: "Swim", activityKey: "swimming", startTime: null, durationMin: 45, status: "missing" });
const gym = (date: string): CheckCard => ({ type: "workout_check", date, gymTime: "18:30", status: "missing" });
const userSaid = (text: string) => rows.push({ id: `u${rows.length + 1}`, user_profile_id: "u", role: "user", content: text, cards: [], turn_id: "t", created_at: stamp() });

beforeEach(() => {
  rows.length = 0;
  answered.clear();
  clock = 0;
});

describe("postCheck", () => {
  it("posts the first check plainly", async () => {
    expect(await postCheck("u", "No sign of your morning walk. Did you get it in?", walk("2026-11-02"))).toMatchObject({ action: "posted" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.content).toBe("No sign of your morning walk. Did you get it in?");
  });

  it("joins a new date to the unanswered message for the same item, one card per date", async () => {
    await postCheck("u", "walk?", walk("2026-11-01"));
    const r = await postCheck("u", "walk?", walk("2026-11-02"));
    expect(r).toMatchObject({ action: "merged", rowId: "r1" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.content).toBe("Morning walk: nothing logged for Sun 1 Nov and Mon 2 Nov. Did you get them in? Answer each below.");
    expect((rows[0]!.cards as CheckCard[]).map((c) => c.date)).toEqual(["2026-11-01", "2026-11-02"]);
  });

  it("starts a new message once the person has written since, and for a different item", async () => {
    await postCheck("u", "walk?", walk("2026-11-01"));
    userSaid("did it");
    await postCheck("u", "walk?", walk("2026-11-02"));
    expect(rows.filter((r) => r.role === "assistant")).toHaveLength(2);
    await postCheck("u", "swim?", swim("2026-11-02"));
    expect(rows.filter((r) => r.role === "assistant")).toHaveLength(3);
  });

  it("does not merge into a check the person already answered on its card", async () => {
    await postCheck("u", "walk?", walk("2026-11-01"));
    answered.add("2026-11-01");
    expect(await postCheck("u", "walk?", walk("2026-11-02"))).toMatchObject({ action: "posted" });
    expect(rows).toHaveLength(2);
  });

  it("folds into the latest message once too many check-ins wait unanswered", async () => {
    await postCheck("u", "walk?", walk("2026-11-01"));
    await postCheck("u", "swim?", swim("2026-11-01"));
    await postCheck("u", "gym?", gym("2026-11-01"));
    expect(rows).toHaveLength(MAX_UNANSWERED);
    const r = await postCheck("u", "gym?", gym("2026-11-02"));
    expect(r).toMatchObject({ action: "merged" });
    const extra: CheckCard = { ...swim("2026-11-02"), itemId: "yoga", label: "Yoga" };
    expect(await postCheck("u", "yoga?", extra)).toMatchObject({ action: "folded", rowId: "r3" });
    expect(rows).toHaveLength(MAX_UNANSWERED);
    const latest = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]!;
    expect(latest.id).toBe("r3");
    expect(latest.content).toBe("A few check-ins piled up while you were away: the gym, swim, morning walk and yoga. Answer the ones below when you can, or just tell me what happened.");
    expect((latest.cards as CheckCard[]).map((c) => c.type)).toEqual(["workout_check", "workout_check", "routine_check"]);
  });

  it("writes the merged and catch-up lines", () => {
    expect(mergedCheckText([gym("2026-11-02"), gym("2026-11-03")])).toBe("No Hevy workout after your gym slot on Mon 2 Nov and Tue 3 Nov. Trained and didn't log, or skipped? Answer each below.");
    expect(mergedCheckText([{ ...gym("2026-11-02"), hevy: false }, { ...gym("2026-11-03"), hevy: false }])).toBe("Gym slots on Mon 2 Nov and Tue 3 Nov: did you train? Answer each below.");
    expect(catchUpText([walk("2026-11-02")])).toMatch(/piled up while you were away: morning walk\./);
  });
});
