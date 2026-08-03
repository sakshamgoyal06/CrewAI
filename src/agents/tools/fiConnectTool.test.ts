import { beforeEach, describe, expect, it, vi } from "vitest";

const beginFiMcpConnect = vi.hoisted(() => vi.fn());
const fetchFiWealthSnapshot = vi.hoisted(() => vi.fn());
const clearFiMcpSession = vi.hoisted(() => vi.fn());
const fiMcpEnabled = vi.hoisted(() => vi.fn());

vi.mock("../../pillars/wealth/fi/index.js", () => ({
  beginFiMcpConnect,
  fetchFiWealthSnapshot,
  clearFiMcpSession,
  fiMcpEnabled,
}));

import {
  acknowledgeFiConnected,
  connectFiTool,
  disconnectFiTool,
  isFiConnectRequest,
  isFiConnectedAck,
  isFiDisconnectRequest,
} from "./fiConnectTool.js";

describe("fiConnectTool patterns", () => {
  it("detects connect and disconnect phrases", () => {
    expect(isFiConnectRequest("connect fi")).toBe(true);
    expect(isFiConnectRequest("link fi money")).toBe(true);
    expect(isFiConnectRequest("what is my net worth")).toBe(false);
    expect(isFiConnectedAck("fi connected")).toBe(true);
    expect(isFiDisconnectRequest("disconnect fi")).toBe(true);
  });
});

describe("connectFiTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fiMcpEnabled.mockReturnValue(true);
  });

  it("returns disabled message when integration off", async () => {
    fiMcpEnabled.mockReturnValue(false);
    const out = await connectFiTool({ userProfileId: "u1" });
    expect(out).toMatch(/disabled/i);
    expect(beginFiMcpConnect).not.toHaveBeenCalled();
  });

  it("returns login URL for new connect", async () => {
    beginFiMcpConnect.mockResolvedValue({
      ok: true,
      alreadyConnected: false,
      loginUrl: "https://fi.money/login?session=abc",
      instructions: "Open browser and enter passcode.",
    });
    const out = await connectFiTool({ userProfileId: "u1" });
    expect(out).toContain("fi.money/login");
    expect(out).toContain("fi connected");
  });

  it("returns already connected when session valid", async () => {
    beginFiMcpConnect.mockResolvedValue({
      ok: true,
      alreadyConnected: true,
      snapshot: {},
    });
    const out = await connectFiTool({ userProfileId: "u1" });
    expect(out).toMatch(/already connected/i);
  });
});

describe("acknowledgeFiConnected", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("confirms when snapshot loads", async () => {
    fetchFiWealthSnapshot.mockResolvedValue({
      ok: true,
      snapshot: { netWorth: { totalNetWorth: { units: "1000000" } } },
      meta: {},
    });
    const out = await acknowledgeFiConnected({ userProfileId: "u1" });
    expect(out).toMatch(/connected/i);
    expect(out).toContain("₹10,00,000");
  });

  it("returns login URL when auth incomplete", async () => {
    fetchFiWealthSnapshot.mockResolvedValue({
      ok: false,
      error: "login_required",
      loginUrl: "https://fi.money/login?session=xyz",
      meta: {},
    });
    const out = await acknowledgeFiConnected({ userProfileId: "u1" });
    expect(out).toContain("fi.money/login");
    expect(out).toMatch(/not complete/i);
  });
});

describe("disconnectFiTool", () => {
  it("clears session", async () => {
    const out = await disconnectFiTool({ userProfileId: "u1" });
    expect(clearFiMcpSession).toHaveBeenCalledWith("u1");
    expect(out).toMatch(/cleared/i);
  });
});
