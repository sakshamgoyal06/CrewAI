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
      "daily_checkin",
      "reminders",
      "proactive",
      "journal_note",
      "conversation",
    ]);
    expect(isParkedGeneralCapability("youtube")).toBe(false);
    expect(isParkedGeneralCapability("notion")).toBe(true);
    expect(isParkedGeneralCapability("daily_checkin")).toBe(false);
    expect(isParkedGeneralCapability("proactive")).toBe(false);
    expect(isParkedGeneralCapability("journal_note")).toBe(false);
    expect(isParkedGeneralCapability("lifeos")).toBe(true);

    // journal stays live: logging is a Phase 1 focus area, so a "note this down" ask that
    // lands on HEALTH must still be savable.
    const health = filterCapabilityCatalog(HEALTH_CAPABILITY_CATALOG);
    expect(health.capabilities.map((c) => c.id)).toEqual([
      "journal",
      "hevy_write",
      "fitness",
      "generic_ack",
    ]);
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

  it("allows the full rhythm and parks only meal and project kinds", () => {
    process.env.MAGNUS_MINIMAL_MODE = "true";
    for (const kind of [
      "evening_journal",
      "evening_log_followup",
      "drift_guard",
      "custom_reminder",
      "week_planning",
      "weekly_wrap",
      "monthly_goal_review",
      "midday_encouragement",
      "stale_list_nudge",
      "chat_inactivity",
    ]) {
      expect(isMinimalProactiveKindEnabled(kind), kind).toBe(true);
    }
    for (const kind of [
      "meal_log_reminder",
      "meal_adherence_nudge",
      "meal_eod_reconciliation",
      "meal_gap_nudge",
      "weekly_nutrition_review",
      "project_conflict_review",
    ]) {
      expect(isMinimalProactiveKindEnabled(kind), kind).toBe(false);
    }
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
    expect(allowlist).toContain("manage_proactive_messages");
    expect(allowlist).not.toContain("connect_notion");
    expect(MINIMAL_MAGNUS_TOOL_NAMES.has("read_calendar")).toBe(true);
  });

  it("filters consultable pillars to HEALTH in minimal mode", () => {
    process.env.MAGNUS_MINIMAL_MODE = "true";
    expect(filterConsultablePillars(["HEALTH", "WEALTH"])).toEqual(["HEALTH"]);
  });
});
