import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./tools/clients.js", () => ({
  supabase: {
    from: () => ({ select: async () => ({ error: null }) }),
  },
  redis: { ping: async () => "PONG" },
  anthropic: {},
}));

import { startHealthServer, type HealthServer } from "./healthServer.js";

// Fresh port per test: a keep-alive socket to a closed server would otherwise be reused.
let port = 8141;

describe("health server", () => {
  let server: HealthServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
    delete process.env.HEALTH_PORT;
  });

  async function base(): Promise<string> {
    port += 1;
    process.env.HEALTH_PORT = String(port);
    server = await startHealthServer();
    return `http://127.0.0.1:${port}`;
  }

  it("serves liveness and readiness", async () => {
    const b = await base();
    expect((await fetch(`${b}/health`)).status).toBe(200);
    expect(await (await fetch(`${b}/ready`)).json()).toEqual({ status: "ready" });
  });

  it("serves the app shell, and the landing page at /", async () => {
    const b = await base();
    const page = await fetch(`${b}/app/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("<title>Magnus</title>");
    const sw = await fetch(`${b}/app/sw.js`);
    expect(sw.headers.get("service-worker-allowed")).toBe("/app/");
    await sw.text();
    const root = await fetch(`${b}/`, { redirect: "manual" });
    expect(root.status).toBe(200);
    expect(await root.text()).toContain('href="/app/"');
  });

  it("guards the API with the app token", async () => {
    const b = await base();
    expect((await fetch(`${b}/api/health/today`)).status).toBe(401);
  });
});
