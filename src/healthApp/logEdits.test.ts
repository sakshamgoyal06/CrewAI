import { beforeEach, describe, expect, it, vi } from "vitest";

/** A tiny in-memory stand-in for the few supabase calls logEdits makes. */
const db = vi.hoisted(() => ({
  chat: [] as Array<{ id: string; user_profile_id: string; cards: Array<Record<string, unknown>> }>,
  calls: [] as Array<{ table: string; op: string; values?: unknown; filters: Array<[string, unknown]> }>,
}));

vi.mock("../tools/clients.js", () => {
  function query(table: string) {
    const filters: Array<[string, unknown]> = [];
    let op = "select";
    let values: unknown;
    const run = async () => {
      db.calls.push({ table, op, values, filters: [...filters] });
      if (table === "health_chat_messages" && op === "select") {
        const want = filters.find(([k]) => k === "contains")?.[1] as Array<{ receiptId: string }>;
        const uid = filters.find(([k]) => k === "user_profile_id")?.[1];
        return { data: db.chat.filter((r) => r.user_profile_id === uid && r.cards.some((c) => c.receiptId === want[0]!.receiptId)), error: null };
      }
      if (table === "health_chat_messages" && op === "update") {
        const id = filters.find(([k]) => k === "id")?.[1];
        const row = db.chat.find((r) => r.id === id);
        if (row) row.cards = (values as { cards: Array<Record<string, unknown>> }).cards;
        return { data: null, error: null };
      }
      return { data: [], error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      update: (v: unknown) => { op = "update"; values = v; return chain; },
      upsert: (v: unknown) => { op = "upsert"; values = v; return run(); },
      delete: () => { op = "delete"; return chain; },
      insert: (v: unknown) => { op = "insert"; values = v; return run(); },
      eq: (k: string, v: unknown) => { filters.push([k, v]); return chain; },
      is: () => chain,
      not: () => chain,
      in: () => chain,
      order: () => chain,
      contains: (_k: string, v: unknown) => { filters.push(["contains", v]); return chain; },
      limit: () => run(),
      maybeSingle: async () => ({ data: null, error: null }),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej),
    };
    return chain;
  }
  return { supabase: { from: (t: string) => query(t) }, anthropic: {} };
});

import { editReceipt, receipt, receiptLine, undoReceipt, type LogReceiptCard } from "./logEdits.js";

const ctx = { userProfileId: "u1", timezone: "Asia/Kolkata", now: new Date("2026-11-05T10:00:00Z") };
const RID = "11111111-1111-4111-8111-111111111111";

function put(card: LogReceiptCard) {
  db.chat.push({ id: "row1", user_profile_id: "u1", cards: [{ type: "meal_draft" }, card as unknown as Record<string, unknown>] });
}

beforeEach(() => {
  db.chat = [];
  db.calls = [];
});

describe("receipt lines", () => {
  it("say what was logged", () => {
    expect(receiptLine(receipt({ type: "log_receipt", kind: "weigh_in", date: "2026-11-05", value: { weightKg: 72.44, bodyFatPct: 18, muscleMassKg: null }, before: null }))).toBe("Weigh-in · 72.4 kg · 18% body fat");
    expect(receiptLine(receipt({ type: "log_receipt", kind: "water", date: "2026-11-05", value: { ml: 250 } }))).toBe("Water · 250 ml");
    expect(receipt({ type: "log_receipt", kind: "water", date: "2026-11-05", value: { ml: 250 } }).receiptId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("undoReceipt", () => {
  it("puts the earlier weigh-in back and marks the card undone on its chat row", async () => {
    put({ type: "log_receipt", receiptId: RID, kind: "weigh_in", date: "2026-11-05", value: { weightKg: 73, bodyFatPct: null, muscleMassKg: null }, before: { weightKg: 72, bodyFatPct: 19, muscleMassKg: null } });
    const r = await undoReceipt(ctx, RID);
    expect(r).toMatchObject({ ok: true, card: { state: "undone" } });
    const upsert = db.calls.find((c) => c.table === "health_body_checkins" && c.op === "upsert");
    expect(upsert?.values).toMatchObject({ local_date: "2026-11-05", weight_kg: 72, body_fat_pct: 19 });
    expect(db.chat[0]!.cards[1]).toMatchObject({ state: "undone" });
    expect(db.chat[0]!.cards[0]).toEqual({ type: "meal_draft" });
  });

  it("deletes a weigh-in that had nothing before it", async () => {
    put({ type: "log_receipt", receiptId: RID, kind: "weigh_in", date: "2026-11-05", value: { weightKg: 73, bodyFatPct: null, muscleMassKg: null }, before: null });
    await undoReceipt(ctx, RID);
    expect(db.calls.some((c) => c.table === "health_body_checkins" && c.op === "delete")).toBe(true);
  });

  it("restores the step total from before", async () => {
    put({ type: "log_receipt", receiptId: RID, kind: "steps", date: "2026-11-05", value: { steps: 9000 }, before: { steps: 4100 } });
    await undoReceipt(ctx, RID);
    expect(db.calls.find((c) => c.table === "health_daily_activity" && c.op === "update")?.values).toMatchObject({ steps: 4100 });
  });

  it("is a no-op the second time, and refuses another person's receipt", async () => {
    put({ type: "log_receipt", receiptId: RID, kind: "steps", date: "2026-11-05", value: { steps: 9000 }, before: null, state: "undone" });
    expect(await undoReceipt(ctx, RID)).toMatchObject({ ok: true });
    expect(db.calls.some((c) => c.table === "health_daily_activity")).toBe(false);
    expect(await undoReceipt({ ...ctx, userProfileId: "someone-else" }, RID)).toEqual({ ok: false, error: "not_found" });
    expect(await undoReceipt(ctx, "not-a-uuid")).toEqual({ ok: false, error: "invalid_id" });
  });
});

describe("editReceipt", () => {
  it("writes the new step total and keeps the card in step", async () => {
    put({ type: "log_receipt", receiptId: RID, kind: "steps", date: "2026-11-05", value: { steps: 9000 }, before: null });
    const r = await editReceipt(ctx, RID, { steps: 7500 });
    expect(r).toMatchObject({ ok: true, card: { value: { steps: 7500 }, state: "edited" } });
    expect(db.calls.find((c) => c.table === "health_daily_activity" && c.op === "upsert")?.values).toMatchObject({ local_date: "2026-11-05", steps: 7500 });
  });

  it("won't edit water or a removal", async () => {
    put({ type: "log_receipt", receiptId: RID, kind: "water", date: "2026-11-05", value: { ml: 250 } });
    expect(await editReceipt(ctx, RID, { steps: 1 })).toEqual({ ok: false, error: "not_editable" });
  });
});
