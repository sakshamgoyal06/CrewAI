import { afterEach, describe, expect, it } from "vitest";

import {
  FOUR_PILLARS,
  intentToPillarRoute,
  isPillarIntentLive,
  livePillarIntents,
  parkedPillarIntents,
} from "./pillarPhilosophy.js";

describe("pillarPhilosophy", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("defines four pillars plus Magnus coordinator", () => {
    expect(FOUR_PILLARS.map((p) => p.intent)).toEqual([
      "HEALTH",
      "WEALTH",
      "HAPPINESS",
      "WISDOM",
    ]);
    expect(intentToPillarRoute("GENERAL")).toEqual({ pillar: "wisdom", department: "magnus" });
  });

  it("maps each pillar intent to stable metadata", () => {
    expect(intentToPillarRoute("HEALTH").pillar).toBe("health");
    expect(intentToPillarRoute("WEALTH").pillar).toBe("wealth");
    expect(intentToPillarRoute("HAPPINESS").pillar).toBe("joy");
    expect(intentToPillarRoute("WISDOM").pillar).toBe("wisdom");
  });

  it("parks wealth/happiness/wisdom in minimal mode but keeps health live", () => {
    process.env.MAGNUS_MINIMAL_MODE = "true";
    expect(livePillarIntents()).toEqual(["HEALTH"]);
    expect(parkedPillarIntents()).toEqual(["WEALTH", "HAPPINESS", "WISDOM"]);
    expect(isPillarIntentLive("HEALTH")).toBe(true);
    expect(isPillarIntentLive("WEALTH")).toBe(false);
  });

  it("enables all pillars when minimal mode is off", () => {
    process.env.MAGNUS_MINIMAL_MODE = "false";
    expect(livePillarIntents()).toHaveLength(4);
    expect(parkedPillarIntents()).toHaveLength(0);
  });
});
