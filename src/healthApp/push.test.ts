import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  subs: [] as Array<{ id: string; endpoint: string; p256dh: string; auth: string; failures: number }>,
  sent: new Set<string>(),
  deleted: [] as string[],
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock("../tools/clients.js", () => {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    let op = "select";
    let row: Record<string, unknown> = {};
    const filters: Record<string, unknown> = {};
    const run = () => {
      if (table === "health_push_subscriptions" && op === "select") return { data: db.subs, error: null };
      if (table === "health_push_subscriptions" && op === "delete") db.deleted.push(String(filters.id));
      if (op === "update") db.updates.push({ table, ...row });
      if (table === "health_notifications" && op === "upsert") {
        const key = String(row.dedupe_key);
        if (db.sent.has(key)) return { data: [], error: null };
        db.sent.add(key);
        return { data: [{ id: `n-${key}` }], error: null };
      }
      return { data: [], error: null };
    };
    Object.assign(chain, {
      select: () => chain,
      upsert: (r: Record<string, unknown>) => ((op = "upsert"), (row = r), chain),
      update: (r: Record<string, unknown>) => ((op = "update"), (row = r), chain),
      delete: () => ((op = "delete"), chain),
      eq: (k: string, v: unknown) => ((filters[k] = v), chain),
      is: (k: string, v: unknown) => ((filters[k] = v), chain),
      then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
    });
    return chain;
  };
  return { supabase: { from }, anthropic: {} };
});

import { isQuiet, parsePrefs, PUSH_OPTIONS, recordReceipt, sendNotification } from "./push.js";

const n = { kind: "meal_reminder" as const, dedupeKey: "meal_reminder:lunch:2026-11-01", title: "Lunch not logged", body: "…" };

beforeEach(() => {
  db.subs = [
    { id: "s1", endpoint: "https://push.example/1", p256dh: "p".repeat(20), auth: "aaaa", failures: 0 },
    { id: "s2", endpoint: "https://push.example/2", p256dh: "p".repeat(20), auth: "bbbb", failures: 0 },
  ];
  db.sent = new Set();
  db.deleted = [];
  db.updates = [];
});

describe("quiet hours", () => {
  const prefs = parsePrefs({ quietStart: "22:30", quietEnd: "07:00" });
  it("wraps past midnight", () => {
    expect(isQuiet("23:10", prefs)).toBe(true);
    expect(isQuiet("06:59", prefs)).toBe(true);
    expect(isQuiet("07:00", prefs)).toBe(false);
    expect(isQuiet("14:00", prefs)).toBe(false);
  });
  it("handles a same-day window and ignores bad stored prefs", () => {
    expect(isQuiet("13:30", parsePrefs({ quietStart: "13:00", quietEnd: "14:00" }))).toBe(true);
    expect(parsePrefs({ quietStart: "nonsense" })).toEqual({ quietStart: "22:30", quietEnd: "07:00", off: [] });
  });
});

describe("sendNotification", () => {
  it("sends to every device once per dedupe key", async () => {
    const send = vi.fn(async () => {});
    expect(await sendNotification("u1", n, send)).toEqual({ sent: true, delivered: 2 });
    expect(await sendNotification("u1", n, send)).toMatchObject({ sent: false, reason: "duplicate" });
    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.parse(send.mock.calls[0]![1] as string)).toMatchObject({ id: `n-${n.dedupeKey}`, title: "Lunch not logged", tag: "meal_reminder" });
  });

  it("removes a subscription the push service says is gone", async () => {
    const send = vi.fn(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith("/1")) throw Object.assign(new Error("gone"), { statusCode: 410 });
    });
    expect(await sendNotification("u1", n, send)).toEqual({ sent: true, delivered: 1 });
    expect(db.deleted).toEqual(["s1"]);
  });

  it("does nothing without devices", async () => {
    db.subs = [];
    expect(await sendNotification("u1", n, vi.fn())).toMatchObject({ sent: false, reason: "no_devices" });
    expect(db.sent.size).toBe(0);
  });
});

describe("delivery to a sleeping phone", () => {
  it("sends every push as high urgency so Doze doesn't hold it", () => {
    expect(PUSH_OPTIONS.urgency).toBe("high");
  });
});

describe("recordReceipt", () => {
  it("records the phone's receipt for a real notification id", async () => {
    expect(await recordReceipt("3b27a3e1-6cd1-42b8-bd07-f14c973be5b9", true, undefined)).toBe(true);
    expect(db.updates.at(-1)).toMatchObject({ table: "health_notifications", shown: true, show_error: null });
  });
  it("ignores anything that isn't a uuid", async () => {
    expect(await recordReceipt("n-1; drop", true, undefined)).toBe(false);
    expect(await recordReceipt(undefined, true, undefined)).toBe(false);
    expect(db.updates).toHaveLength(0);
  });
  it("keeps why a notification couldn't be shown", async () => {
    await recordReceipt("3b27a3e1-6cd1-42b8-bd07-f14c973be5b9", false, "No notification permission");
    expect(db.updates.at(-1)).toMatchObject({ shown: false, show_error: "No notification permission" });
  });
});

describe("VAPID keys from the environment", () => {
  it("derives the public key from the private key", async () => {
    const { generateVapidKeys, vapidPublicKeyOf, pushConfig } = await import("./push.js");
    const k = generateVapidKeys();
    expect(vapidPublicKeyOf(k.privateKey)).toBe(k.publicKey);
    expect(vapidPublicKeyOf("not-a-key")).toBe("");
    const saved = { ...process.env };
    try {
      delete process.env.MAGNUS_VAPID_PUBLIC_KEY;
      process.env.MAGNUS_VAPID_PRIVATE_KEY = k.privateKey;
      expect(pushConfig()?.publicKey).toBe(k.publicKey);
      delete process.env.MAGNUS_VAPID_PRIVATE_KEY;
      expect(pushConfig()).toBeNull();
    } finally {
      process.env = saved;
    }
  });
});
