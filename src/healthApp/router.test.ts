import type { AddressInfo } from "node:net";

import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const upsertMock = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));

vi.mock("../tools/clients.js", () => ({ supabase: {}, redis: {}, anthropic: {} }));
vi.mock("./activityStore.js", () => ({
  ACTIVITY_SOURCES: ["manual", "ios_shortcut", "health_auto_export", "health_connect", "api"],
  upsertDailyActivity: upsertMock,
}));
vi.mock("./snapshot.js", () => ({
  loadHealthProfile: async () => ({ timezone: "UTC", targets: {} }),
  buildHealthSnapshot: async () => ({ ok: "snapshot" }),
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

beforeEach(() => upsertMock.mockClear());

const auth = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

describe("health app router", () => {
  it("rejects requests without the token", async () => {
    const res = await fetch(`${base}/today`);
    expect(res.status).toBe(401);
  });

  it("returns the snapshot with the token", async () => {
    const res = await fetch(`${base}/today`, { headers: auth });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: "snapshot" });
  });

  it("validates the steps body", async () => {
    const res = await fetch(`${base}/steps`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ steps: -5 }),
    });
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects future dates", async () => {
    const res = await fetch(`${base}/steps`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ steps: 100, date: "2999-01-01" }),
    });
    expect(res.status).toBe(400);
  });

  it("saves steps for the given day, accepting string numbers from phone automations", async () => {
    const res = await fetch(`${base}/steps`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ steps: "9412", walkMinutes: "35", date: "2026-10-01", source: "ios_shortcut" }),
    });
    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledWith("profile-1", {
      localDate: "2026-10-01",
      steps: 9412,
      walkMinutes: 35,
      walkDistanceM: null,
      source: "ios_shortcut",
    });
  });
});
