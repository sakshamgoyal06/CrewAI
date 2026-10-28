/**
 * Internal HTTP route security — morning brief job must not run without secret.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const runMorningBriefMock = vi.hoisted(() =>
  vi.fn(async () => ({ skipped: false, notionPageId: null })),
);

vi.mock("./jobs/morningBrief.js", () => ({
  runMorningBrief: runMorningBriefMock,
}));

vi.mock("./tools/clients.js", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: "profile-1", telegram_chat_id: "123" },
            error: null,
          }),
        }),
      }),
    }),
  },
  redis: { ping: async () => "PONG" },
  anthropic: {},
}));

import { startHealthServer, type HealthServer } from "./healthServer.js";

const PORT = 8140;

describe("internal morning-brief route", () => {
  const env = { ...process.env };
  let server: HealthServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
    process.env = { ...env };
    vi.unstubAllEnvs();
    delete process.env.HEALTH_PORT;
    runMorningBriefMock.mockClear();
  });

  async function baseUrl(): Promise<string> {
    process.env.HEALTH_PORT = String(PORT);
    server = await startHealthServer();
    return `http://127.0.0.1:${PORT}`;
  }

  it("returns 401 when secret is unset", async () => {
    delete process.env.MAGNUS_INTERNAL_JOB_SECRET;
    const base = await baseUrl();
    const res = await fetch(`${base}/internal/jobs/morning-brief`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userProfileId: "profile-1" }),
    });
    expect(res.status).toBe(401);
    expect(runMorningBriefMock).not.toHaveBeenCalled();
  });

  it("returns 401 with wrong bearer token", async () => {
    process.env.MAGNUS_INTERNAL_JOB_SECRET = "correct-secret";
    const base = await baseUrl();
    const res = await fetch(`${base}/internal/jobs/morning-brief`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer wrong-secret",
      },
      body: JSON.stringify({ userProfileId: "profile-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("runs job with valid bearer and userProfileId", async () => {
    process.env.MAGNUS_INTERNAL_JOB_SECRET = "correct-secret";
    const base = await baseUrl();
    const res = await fetch(`${base}/internal/jobs/morning-brief`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer correct-secret",
      },
      body: JSON.stringify({ userProfileId: "profile-1" }),
    });
    expect(res.status).toBe(200);
    expect(runMorningBriefMock).toHaveBeenCalledOnce();
  });
});
