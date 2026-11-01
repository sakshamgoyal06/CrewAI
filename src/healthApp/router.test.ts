import type { AddressInfo } from "node:net";

import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const upsertMock = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));
const checkinMock = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));
const confirmMock = vi.hoisted(() => vi.fn());

vi.mock("../tools/clients.js", () => ({ supabase: {}, redis: {}, anthropic: {} }));
vi.mock("./activityStore.js", () => ({
  ACTIVITY_SOURCES: ["manual", "ios_shortcut", "health_auto_export", "health_connect", "api"],
  upsertDailyActivity: upsertMock,
}));
vi.mock("./bodyStore.js", () => ({
  upsertBodyCheckin: checkinMock,
  setActiveGoal: vi.fn(async () => ({ ok: true, id: "g1" })),
  updateDailyTargets: vi.fn(async () => ({ ok: true })),
}));
vi.mock("./meals.js", async (orig) => ({
  ...(await orig<typeof import("./meals.js")>()),
  saveConfirmedMeal: confirmMock,
}));
vi.mock("./snapshot.js", () => ({
  loadHealthProfile: async () => ({ timezone: "UTC", targets: {} }),
  buildHealthSnapshot: async () => ({ ok: "snapshot" }),
}));
vi.mock("./chat.js", () => ({
  loadChatHistory: async () => [],
  runHealthChat: async (_ctx: unknown, text: string) => ({ text: `echo ${text}`, cards: [], changed: false }),
}));

import { createHealthAppRouter } from "./router.js";

const TOKEN = "t".repeat(40);
let base = "";
let close: () => void = () => {};

beforeAll(async () => {
  process.env.MAGNUS_HEALTH_APP_TOKEN = TOKEN;
  process.env.MAGNUS_HEALTH_APP_USER_PROFILE_ID = "profile-1";
  const app = express();
  app.use(express.json());
  app.use("/api/health", createHealthAppRouter());
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/health`;
  close = () => server.close();
});

afterAll(() => {
  close();
  delete process.env.MAGNUS_HEALTH_APP_TOKEN;
  delete process.env.MAGNUS_HEALTH_APP_USER_PROFILE_ID;
});

beforeEach(() => {
  upsertMock.mockClear();
  checkinMock.mockClear();
  confirmMock.mockReset();
});

const auth = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: "POST", headers: auth, body: JSON.stringify(body) });

describe("health app router", () => {
  it("rejects requests without the token", async () => {
    expect((await fetch(`${base}/today`)).status).toBe(401);
    expect((await fetch(`${base}/chat`, { method: "POST" })).status).toBe(401);
  });

  it("returns the snapshot with the token", async () => {
    const res = await fetch(`${base}/today`, { headers: auth });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: "snapshot" });
  });

  it("runs a chat turn", async () => {
    const res = await post("/chat", { text: "hi" });
    expect(await res.json()).toEqual({ text: "echo hi", cards: [], changed: false });
  });

  it("validates the steps body", async () => {
    expect((await post("/steps", { steps: -5 })).status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects future dates", async () => {
    const res = await post("/steps", { steps: 100, date: "2999-01-01" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "future_date" });
  });

  it("saves steps, accepting string numbers from phone automations", async () => {
    const res = await post("/steps", { steps: "9412", walkMinutes: "35", date: "2026-10-01", source: "health_connect" });
    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledWith("profile-1", {
      localDate: "2026-10-01",
      steps: 9412,
      walkMinutes: 35,
      walkDistanceM: null,
      source: "health_connect",
    });
  });

  it("needs at least one body metric on a check-in", async () => {
    expect((await post("/checkins", { date: "2026-10-01" })).status).toBe(400);
    expect((await post("/checkins", { weightKg: 84.2 })).status).toBe(200);
    expect(checkinMock).toHaveBeenCalledWith("profile-1", expect.objectContaining({ weight_kg: 84.2 }));
  });

  it("rejects a goal deadline in the past", async () => {
    const res = await post("/goal", { targetWeightKg: 78, deadline: "2020-01-01" });
    expect(res.status).toBe(400);
  });

  it("validates confirmed meal items before saving", async () => {
    const bad = await post("/meals/confirm", {
      draftId: "not-a-uuid",
      text: "x",
      slot: "lunch",
      source: "usda_fdc",
      items: [],
    });
    expect(bad.status).toBe(400);
    expect(confirmMock).not.toHaveBeenCalled();

    confirmMock.mockResolvedValue({ ok: true, mealSessionId: "id", localDate: "2026-10-27", totals: {}, alreadySaved: false });
    const good = await post("/meals/confirm", {
      draftId: "7b0c7a8e-2f55-4a8e-9a3b-0b6c1f1d2e3f",
      text: "rice",
      slot: "lunch",
      source: "usda_fdc",
      items: [{ name: "rice", calories: "200", protein_g: 4, carbs_g: 44, fat_g: 0.4 }],
    });
    expect(good.status).toBe(200);
    expect(confirmMock).toHaveBeenCalledWith(
      "profile-1",
      expect.objectContaining({ items: [{ name: "rice", calories: 200, protein_g: 4, carbs_g: 44, fat_g: 0.4 }], edited: false }),
      undefined,
    );
  });
});
