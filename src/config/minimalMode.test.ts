import { afterEach, describe, expect, it } from "vitest";

import {
  filterCapabilityCatalog,
  filterConsultablePillars,
  isMinimalMode,
  isMinimalProactiveJobEnabled,
  isMinimalProactiveKindEnabled,
  isParkedGeneralCapability,
  isParkedIntent,
  magnusDefaultToolAllowlist,
  MINIMAL_FOCUS_AREAS,
  MINIMAL_MAGNUS_TOOL_NAMES,
} from "./minimalMode.js";
import { GENERAL_CAPABILITY_CATALOG } from "../agents/routing/pillarStrategy/catalogs/generalCatalog.js";
import { HEALTH_CAPABILITY_CATALOG } from "../agents/routing/pillarStrategy/catalogs/healthCatalog.js";

describe("minimalMode", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("defaults to minimal in production when unset", () => {
    delete process.env.MAGNUS_MINIMAL_MODE;
    process.env.NODE_ENV = "production";
    expect(isMinimalMode()).toBe(true);
  });

  it("can be disabled explicitly", () => {
    process.env.MAGNUS_MINIMAL_MODE = "false";
    process.env.NODE_ENV = "production";
    expect(isMinimalMode()).toBe(false);
  });

  it("filters general and health catalogs", () => {
    process.env.MAGNUS_MINIMAL_MODE = "true";
    const general = filterCapabilityCatalog(GENERAL_CAPABILITY_CATALOG);
    expect(general.capabilities.map((c) => c.id)).toEqual([
      "pillar_consultation",
      "day_overview",
      "calendar",
      "event_log",
      "youtube",
      "lists",
      "reminders",
      "journal_note",
      "conversation",
    ]);
    expect(isParkedGeneralCapability("youtube")).toBe(false);
    expect(isParkedGeneralCapability("notion")).toBe(true);

    const health = filterCapabilityCatalog(HEALTH_CAPABILITY_CATALOG);
    expect(health.capabilities.map((c) => c.id)).toEqual(["hevy_write", "fitness", "generic_ack"]);
  });

  it("parks wealth/happiness/wisdom intents", () => {
    process.env.MAGNUS_MINIMAL_MODE = "true";
    expect(isParkedIntent("WEALTH")).toBe(true);
    expect(isParkedIntent("HEALTH")).toBe(false);
  });

  it("exposes Phase 1 focus areas", () => {
    expect(MINIMAL_FOCUS_AREAS).toEqual([
      "workouts",
      "calendar",
      "lists",
      "reminders",
      "logging",
    ]);
  });

  it("allows core proactive jobs including subscription dispatcher for logging", () => {
    process.env.MAGNUS_MINIMAL_MODE = "true";
    expect(isMinimalProactiveJobEnabled("event_reminder")).toBe(true);
    expect(isMinimalProactiveJobEnabled("activity_completion")).toBe(true);
    expect(isMinimalProactiveJobEnabled("gym_hevy_reconcile")).toBe(true);
    expect(isMinimalProactiveJobEnabled("morning_brief")).toBe(true);
    expect(isMinimalProactiveJobEnabled("proactive_subscriptions")).toBe(true);
    expect(isMinimalProactiveJobEnabled("nutrition_nightly")).toBe(false);
  });

  it("allows logging and workout proactive kinds only", () => {
    process.env.MAGNUS_MINIMAL_MODE = "true";
    expect(isMinimalProactiveKindEnabled("evening_journal")).toBe(true);
    expect(isMinimalProactiveKindEnabled("evening_log_followup")).toBe(true);
    expect(isMinimalProactiveKindEnabled("drift_guard")).toBe(true);
    expect(isMinimalProactiveKindEnabled("custom_reminder")).toBe(true);
    expect(isMinimalProactiveKindEnabled("meal_log_reminder")).toBe(false);
    expect(isMinimalProactiveKindEnabled("week_planning")).toBe(false);
  });

  it("exposes a magnus tool allowlist with lists and youtube", () => {
    process.env.MAGNUS_MINIMAL_MODE = "true";
    const allowlist = magnusDefaultToolAllowlist();
    expect(allowlist).toBeDefined();
    expect(allowlist).toContain("manage_reminders");
    expect(allowlist).toContain("youtube_search");
    expect(allowlist).toContain("list_items");
    expect(allowlist).toContain("log_note");
    expect(allowlist).toContain("log_daily_checkin");
    expect(allowlist).not.toContain("connect_notion");
    expect(MINIMAL_MAGNUS_TOOL_NAMES.has("read_calendar")).toBe(true);
  });

  it("filters consultable pillars to HEALTH in minimal mode", () => {
    process.env.MAGNUS_MINIMAL_MODE = "true";
    expect(filterConsultablePillars(["HEALTH", "WEALTH"])).toEqual(["HEALTH"]);
  });
});
