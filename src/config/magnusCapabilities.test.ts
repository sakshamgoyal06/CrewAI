import { describe, expect, it } from "vitest";

import {
  capabilityLogFields,
  describeCapabilities,
  type Capability,
  type EnvBag,
} from "./magnusCapabilities.js";

const CORE_ENV: EnvBag = {
  TELEGRAM_BOT_TOKEN: "123:abc",
  ANTHROPIC_API_KEY: "sk-ant-x",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "redis-token",
};

function capability(env: EnvBag, id: string): Capability {
  const found = describeCapabilities(env).capabilities.find((c) => c.id === id);
  if (!found) {
    throw new Error(`capability ${id} missing from report`);
  }
  return found;
}

describe("describeCapabilities — core", () => {
  it("is satisfied by token, Claude, Supabase, and Redis", () => {
    expect(describeCapabilities(CORE_ENV).coreOk).toBe(true);
  });

  it("fails when the bot token is missing", () => {
    const summary = describeCapabilities({ ...CORE_ENV, TELEGRAM_BOT_TOKEN: "  " });
    expect(summary.coreOk).toBe(false);
    expect(summary.core.find((c) => c.label === "Telegram bot token")?.ok).toBe(false);
  });

  it("accepts the anon key locally but not in production", () => {
    const anonEnv: EnvBag = {
      ...CORE_ENV,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      SUPABASE_ANON_KEY: "anon",
    };
    expect(describeCapabilities(anonEnv).coreOk).toBe(true);
    expect(describeCapabilities({ ...anonEnv, NODE_ENV: "production" }).coreOk).toBe(false);
  });

  it("accepts plain REDIS_URL / REDIS_TOKEN", () => {
    const summary = describeCapabilities({
      ...CORE_ENV,
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
      REDIS_URL: "https://redis",
      REDIS_TOKEN: "token",
    });
    expect(summary.coreOk).toBe(true);
  });
});

describe("describeCapabilities — meals", () => {
  it("is ready with a structured nutrition API", () => {
    const meals = capability({ ...CORE_ENV, USDA_FDC_API_KEY: "usda" }, "meals");
    expect(meals.status).toBe("ready");
    expect(meals.detail).toContain("USDA FDC");
  });

  it("is partial when only web research is available", () => {
    const meals = capability(CORE_ENV, "meals");
    expect(meals.status).toBe("partial");
    expect(meals.missing).toContain("USDA_FDC_API_KEY");
  });

  it("is off when every source is disabled", () => {
    const meals = capability(
      { ...CORE_ENV, MAGNUS_MEAL_LOG_WEB_FIRST: "false" },
      "meals",
    );
    expect(meals.status).toBe("off");
  });
});

describe("describeCapabilities — optional lanes", () => {
  it("marks Hevy partial without a key and ready with one", () => {
    expect(capability(CORE_ENV, "workouts").status).toBe("partial");
    expect(capability({ ...CORE_ENV, HEVY_API_KEY: "k" }, "workouts").status).toBe("ready");
  });

  it("treats a Notion token without targets as partial", () => {
    expect(capability(CORE_ENV, "notion").status).toBe("off");
    expect(capability({ ...CORE_ENV, NOTION_TOKEN: "t" }, "notion").status).toBe("partial");
    expect(
      capability(
        { ...CORE_ENV, NOTION_TOKEN: "t", NOTION_GOALS_DATABASE_ID: "db" },
        "notion",
      ).status,
    ).toBe("ready");
  });

  it("reports the Morning Brief cron separately from the on-demand command", () => {
    expect(capability(CORE_ENV, "morning_brief").status).toBe("partial");
    expect(
      capability({ ...CORE_ENV, MAGNUS_MORNING_BRIEF_CRON_ENABLED: "true" }, "morning_brief")
        .status,
    ).toBe("ready");
    expect(
      capability({ ...CORE_ENV, MAGNUS_MORNING_BRIEF_ENABLED: "false" }, "morning_brief")
        .status,
    ).toBe("off");
  });

  it("flags new users needing manual allowlisting", () => {
    expect(capability(CORE_ENV, "access").missing).toContain(
      "MAGNUS_AUTO_ALLOWLIST_NEW_USERS",
    );
    expect(
      capability({ ...CORE_ENV, MAGNUS_AUTO_ALLOWLIST_NEW_USERS: "true" }, "access").status,
    ).toBe("ready");
  });
});

describe("capabilityLogFields", () => {
  it("buckets capability ids by status", () => {
    const fields = capabilityLogFields(describeCapabilities(CORE_ENV));
    expect(fields.coreOk).toBe(true);
    expect(fields.ready).toContain("chat");
    expect(fields.off).toContain("notion");
  });
});
