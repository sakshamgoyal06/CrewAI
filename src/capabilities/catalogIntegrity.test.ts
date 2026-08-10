/**
 * Catalog and tool-map coherence — guards architecture drift between
 * capability catalogs, Magnus tools, and pillar routing.
 */
import { describe, expect, it } from "vitest";

import { GENERAL_CAPABILITY_TOOLS } from "../agents/routing/pillarStrategy/catalogs/generalCatalog.js";
import {
  getCapabilityCatalog,
  isValidCapability,
} from "../agents/routing/pillarStrategy/catalogs/index.js";
import type { PillarId } from "../agents/routing/pillarTypes.js";
import { INTENTS } from "../intent.js";

/** Tool names registered on Magnus agent (source of truth for GENERAL executors). */
const MAGNUS_TOOL_NAMES = [
  "read_calendar",
  "create_calendar_event",
  "update_calendar_event",
  "delete_calendar_event",
  "log_note",
  "log_event",
  "update_event",
  "reschedule_event",
  "list_events",
  "manage_proactive_messages",
  "youtube_search",
  "youtube_recommend",
  "youtube_playlist",
  "youtube_bookmark",
  "youtube_cue",
  "list_catalog",
  "list_items",
  "add_list_item",
  "update_list_item",
  "create_list",
  "link_notion_list",
  "recommend_list_items",
  "update_pillar_status",
  "log_joy_tank",
  "list_lifeos_goals",
  "get_daily_checkin",
  "log_daily_checkin",
  "add_goal",
  "list_notion_items",
  "add_notion_item",
  "update_notion_item",
  "add_notion_goal",
  "connect_notion",
  "sync_notion",
  "setup_notion",
  "connect_google",
  "connect_youtube",
  "connect_calendar",
  "connect_zerodha",
  "connect_kite",
] as const;

const PILLARS: PillarId[] = ["HEALTH", "WEALTH", "HAPPINESS", "WISDOM", "GENERAL"];

describe("capability catalog integrity", () => {
  it("maps every intent to a pillar catalog", () => {
    for (const intent of INTENTS) {
      const catalog = getCapabilityCatalog(intent as PillarId);
      expect(catalog.pillar).toBe(intent);
      expect(catalog.capabilities.length).toBeGreaterThan(0);
    }
  });

  it("uses unique capability ids within each pillar", () => {
    for (const pillar of PILLARS) {
      const ids = getCapabilityCatalog(pillar).capabilities.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("requires summary and disambiguation on every capability", () => {
    for (const pillar of PILLARS) {
      for (const cap of getCapabilityCatalog(pillar).capabilities) {
        expect(cap.summary.trim().length).toBeGreaterThan(5);
        expect(cap.disambiguation.trim().length).toBeGreaterThan(5);
      }
    }
  });

  it("validates capabilities via isValidCapability", () => {
    for (const pillar of PILLARS) {
      const catalog = getCapabilityCatalog(pillar);
      for (const cap of catalog.capabilities) {
        expect(isValidCapability(pillar, cap.id)).toBe(true);
      }
      expect(isValidCapability(pillar, "__invalid__")).toBe(false);
    }
  });

  it("maps GENERAL tool names only to registered Magnus tools", () => {
    const magnusSet = new Set(MAGNUS_TOOL_NAMES);
    for (const [capId, tools] of Object.entries(GENERAL_CAPABILITY_TOOLS)) {
      for (const tool of tools) {
        expect(magnusSet.has(tool as typeof MAGNUS_TOOL_NAMES[number]), `${capId} → ${tool}`).toBe(
          true,
        );
      }
    }
  });

  it("covers every Magnus tool in at least one GENERAL capability bucket", () => {
    const mapped = new Set<string>();
    for (const tools of Object.values(GENERAL_CAPABILITY_TOOLS)) {
      for (const t of tools) {
        mapped.add(t);
      }
    }
    for (const tool of MAGNUS_TOOL_NAMES) {
      expect(mapped.has(tool), `orphan Magnus tool: ${tool}`).toBe(true);
    }
  });

  it("keeps pillar_consultation and day_overview tool-free (executor-owned)", () => {
    expect(GENERAL_CAPABILITY_TOOLS.pillar_consultation).toEqual([]);
    expect(GENERAL_CAPABILITY_TOOLS.day_overview).toEqual([]);
    expect(GENERAL_CAPABILITY_TOOLS.conversation).toEqual([]);
  });
});
