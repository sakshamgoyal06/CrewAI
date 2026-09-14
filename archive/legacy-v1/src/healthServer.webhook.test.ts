import { afterEach, describe, expect, it, vi } from "vitest";

import { startHealthServer, type HealthServer } from "./healthServer.js";

const PATH = "/telegram/deadbeef";
const SECRET = "test-secret";
const PORT = 8137;

let server: HealthServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
  delete process.env.HEALTH_PORT;
});

async function start(handleUpdate: (u: unknown) => Promise<void>): Promise<string> {
  process.env.HEALTH_PORT = String(PORT);
  server = await startHealthServer({
    telegramWebhook: { path: PATH, secretToken: SECRET, handleUpdate },
  });
  return `http://127.0.0.1:${PORT}`;
}

describe("telegram webhook route", () => {
  it("acknowledges a valid update immediately and processes it out of band", async () => {
    let resolveHandled: () => void = () => {};
    const handled = new Promise<void>((r) => {
      resolveHandled = r;
    });
    const handleUpdate = vi.fn(async () => {
      resolveHandled();
    });

    const base = await start(handleUpdate);
    const res = await fetch(`${base}${PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": SECRET,
      },
      body: JSON.stringify({ update_id: 1 }),
    });

    expect(res.status).toBe(200);
    await handled;
    expect(handleUpdate).toHaveBeenCalledWith({ update_id: 1 });
  });

  it("rejects a post without the secret token", async () => {
    const handleUpdate = vi.fn(async () => {});
    const base = await start(handleUpdate);

    const res = await fetch(`${base}${PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ update_id: 2 }),
    });

    expect(res.status).toBe(401);
    expect(handleUpdate).not.toHaveBeenCalled();
  });

  it("still serves liveness while the webhook is mounted", async () => {
    const base = await start(async () => {});
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "ok" });
  });
});
