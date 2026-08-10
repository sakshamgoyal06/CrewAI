import { beforeEach, describe, expect, it, vi } from "vitest";

import { HEALTH_CAPABILITY_IDS } from "./catalogs/healthCatalog.js";
import { GENERAL_CAPABILITY_IDS } from "./catalogs/generalCatalog.js";
import { isValidCapability } from "./catalogs/index.js";
import {
  parsePillarExecutionPlan,
  parsePillarStrategy,
  pillarStrategyEnabled,
} from "./parsePillarStrategy.js";

const createMock = vi.fn();

vi.mock("../../../tools/clients.js", () => ({
  anthropic: {
    messages: {
      create: (...args: unknown[]) => createMock(...args),
    },
  },
}));

const EMPTY_HINTS = {
  has_meal_photo: false,
  photo_purpose: null,
  photo_description_preview: null,
  photo_extracted_items: [],
  explicit_meal_log: false,
  active_meal_plan_session: false,
  meal_plan_session_step: null,
  active_project_session: false,
  project_session_step: null,
  active_projects: [],
  previous_turn_intent: null,
  previous_turn_capability: null,
  previous_turn_was_meal_log: false,
  previous_turn_meal_plan_locked: false,
  google_calendar_connected: false,
  youtube_connected: false,
  notion_connected: false,
  hevy_connected: false,
  zerodha_connected: false,
  recent_turns: [],
};

describe("parsePillarExecutionPlan", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("returns multi-step plan from LLM JSON", async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            confidence: 0.92,
            steps: [
              {
                capability: "meal_plan_read",
                args: { horizon_hint: "this week" },
                intent_summary: "Show meal plan for this week",
              },
              {
                capability: "meal_plan_shopping_list",
                args: {},
                intent_summary: "Build shopping list from the plan",
              },
            ],
          }),
        },
      ],
    });

    const plan = await parsePillarExecutionPlan(
      "HEALTH",
      "show my meal plan this week and give me the shopping list",
      EMPTY_HINTS,
    );

    expect(plan).toMatchObject({
      confidence: 0.92,
      parser: "llm",
      steps: [
        { capability: "meal_plan_read", args: { horizon_hint: "this week" } },
        { capability: "meal_plan_shopping_list", args: {} },
      ],
    });
    expect(plan.steps).toHaveLength(2);
    expect(String(createMock.mock.calls[0]![0].system)).toContain("meal_plan_read");
  });

  it("accepts legacy single-capability JSON shape", async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: '{"capability":"meal_plan_create","confidence":0.92,"args":{"horizon_hint":"2 weeks"}}',
        },
      ],
    });

    const plan = await parsePillarStrategy("HEALTH", "make meal plan for next 2 weeks", EMPTY_HINTS);

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({
      capability: "meal_plan_create",
      args: { horizon_hint: "2 weeks" },
    });
    expect(plan.confidence).toBe(0.92);
  });

  it("accepts meal_plan_swap with exchange_with_slot from parser JSON", async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            confidence: 0.93,
            steps: [
              {
                capability: "meal_plan_swap",
                args: {
                  slot: "lunch",
                  exchange_with_slot: "dinner",
                  date_hint: "today",
                },
                intent_summary: "Switch lunch and dinner for today",
              },
            ],
          }),
        },
      ],
    });

    const plan = await parsePillarExecutionPlan(
      "HEALTH",
      "switch lunch and dinner for today",
      EMPTY_HINTS,
    );

    expect(plan.steps[0]).toMatchObject({
      capability: "meal_plan_swap",
      args: {
        slot: "lunch",
        exchange_with_slot: "dinner",
        date_hint: "today",
      },
    });
    expect(String(createMock.mock.calls[0]![0].system)).toContain("exchange_with_slot");
  });

  it("routes active project session to project_setup without LLM", async () => {
    const plan = await parsePillarExecutionPlan("GENERAL", "Lock it in.", {
      ...EMPTY_HINTS,
      active_project_session: true,
      project_session_step: "review",
      active_projects: [],
    });

    expect(createMock).not.toHaveBeenCalled();
    expect(plan.steps[0]?.capability).toBe("project_setup");
    expect(plan.parser).toBe("deterministic");
  });

  it("falls back when LLM returns invalid capabilities", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"steps":[{"capability":"not_real","args":{}}],"confidence":0.9}' }],
    });

    const plan = await parsePillarExecutionPlan("HEALTH", "hello", EMPTY_HINTS);

    expect(plan.steps[0]?.capability).toBe("generic_ack");
    expect(plan.parser).toBe("deterministic");
  });

  it("validates catalog membership", () => {
    for (const id of HEALTH_CAPABILITY_IDS) {
      expect(isValidCapability("HEALTH", id)).toBe(true);
    }
    for (const id of GENERAL_CAPABILITY_IDS) {
      expect(isValidCapability("GENERAL", id)).toBe(true);
    }
    expect(isValidCapability("HEALTH", "calendar")).toBe(false);
  });

  it("parser prompt includes read-vs-create disambiguation rules", async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: '{"confidence":0.9,"steps":[{"capability":"meal_plan_read","args":{"horizon_hint":"tomorrow"}}]}',
        },
      ],
    });

    await parsePillarExecutionPlan("HEALTH", "What's my meal plan for tomorrow", {
      ...EMPTY_HINTS,
      previous_turn_meal_plan_locked: true,
      recent_turns: [
        { role: "assistant", preview: "Plan locked — 42 meals saved" },
        { role: "user", preview: "save plan" },
      ],
    });

    const payload = JSON.parse(String(createMock.mock.calls[0]![0].messages[0].content));
    expect(payload.routing_hints.previous_turn_meal_plan_locked).toBe(true);
    expect(String(createMock.mock.calls[0]![0].system)).toContain("meal_plan_read");
  });

  it("pillarStrategyEnabled is always true", () => {
    expect(pillarStrategyEnabled()).toBe(true);
  });
});
