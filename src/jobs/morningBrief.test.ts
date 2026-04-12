import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as morningBriefContext from "./morningBriefContext.js";
import {
  buildMorningBriefUserMessage,
  filterEmergingPlusPatterns,
  type MorningBriefContextBundle,
} from "./morningBriefContext.js";
import { runMorningBrief } from "./morningBrief.js";
import { getLocalTimeParts } from "./morningBriefTime.js";

describe("buildMorningBriefUserMessage", () => {
  it("matches snapshot (fixed now, no wall-clock flake)", () => {
    const bundle: MorningBriefContextBundle = {
      nowIso: "2026-04-12T02:30:00.000Z",
      timeZone: "Asia/Kolkata",
      northStarGoal: "Build with intention",
      goals: [{ pillar: "health", title: "Morning mobility" }],
      pillarStatus: [{ pillar: "joy", status: "on_track" }],
      happinessReserve: { tank_band: "nourished", streak_type: "neutral" },
      kpiReadings: [{ recorded_at: "2026-04-11T00:00:00.000Z", status: "green" }],
      magnusInsights: [{ summary: "Energy stable mid-week" }],
      dailyPlans: [{ created_at: "2026-04-11T18:00:00.000Z" }],
      magnusDailyLogs: [{ body: "Ship feature", log_date: "2026-04-11", source: "notion" }],
      patternRows: [{ status: "emerging", name: "Late caffeine", hit_count: 3 }],
    };
    expect(buildMorningBriefUserMessage(bundle)).toMatchSnapshot();
  });
});

describe("filterEmergingPlusPatterns", () => {
  it("drops tentative", () => {
    const rows = [
      { status: "tentative", name: "noise" },
      { status: "emerging", name: "signal", hit_count: 2 },
    ];
    expect(filterEmergingPlusPatterns(rows)).toHaveLength(1);
  });
});

describe("getLocalTimeParts", () => {
  it("returns stable calendar date in zone for fixed instant", () => {
    const instant = new Date("2026-04-12T02:30:00.000Z");
    const p = getLocalTimeParts(instant, "Asia/Kolkata");
    expect(p.dateKey).toBe("2026-04-12");
    expect(p.hour).toBeGreaterThanOrEqual(0);
    expect(p.hour).toBeLessThanOrEqual(23);
  });
});

describe("runMorningBrief", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses injected clock and LLM (no live APIs)", async () => {
    const now = new Date("2026-04-12T08:00:00.000Z");
    const invokeClaude = vi.fn().mockResolvedValue("**Morning read**\n\nOne insight.\nJoy: steady.");

    const bundle: MorningBriefContextBundle = {
      nowIso: now.toISOString(),
      timeZone: "UTC",
      northStarGoal: undefined,
      goals: [],
      pillarStatus: [],
      happinessReserve: null,
      kpiReadings: [],
      magnusInsights: [],
      dailyPlans: [],
      magnusDailyLogs: [],
      patternRows: [],
    };
    vi.spyOn(morningBriefContext, "fetchMorningBriefContext").mockResolvedValue(bundle);

    const result = await runMorningBrief(
      {
        userProfileId: "00000000-0000-0000-0000-000000000001",
        telegramUserId: "12345",
        now,
        reason: "manual",
      },
      {
        supabase: {} as SupabaseClient,
        invokeClaude,
        featureEnabled: () => true,
        createNotionPage: vi.fn().mockResolvedValue(null),
      },
    );

    expect(result.skipped).toBe(false);
    expect(result.text).toContain("Morning read");
    expect(invokeClaude).toHaveBeenCalledTimes(1);
    const [system, user] = invokeClaude.mock.calls[0] ?? [];
    expect(system).toContain("READ");
    expect(user).toContain("2026-04-12T08:00:00.000Z");
  });
});
