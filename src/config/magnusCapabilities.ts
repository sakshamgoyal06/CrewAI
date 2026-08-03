/**
 * "Which Magnus lanes are actually live with this environment?" — one shared answer for the
 * Telegram setup CLI (`npm run telegram:check`) and the boot log.
 *
 * Pure on purpose: every check reads an env bag passed in, so it is testable and can describe a
 * remote host's variables (e.g. pasted Railway config) as easily as `process.env`.
 */

import { resolveTelegramRuntime } from "./telegramRuntime.js";

export type EnvBag = Record<string, string | undefined>;

/** `ready` — usable now. `partial` — works but a better path is unconfigured. `off` — unavailable. */
export type CapabilityStatus = "ready" | "partial" | "off";

export type CoreRequirement = {
  label: string;
  /** Any one of these satisfies the requirement. */
  vars: readonly string[];
  ok: boolean;
  detail: string;
};

export type Capability = {
  id: string;
  title: string;
  /** How the user reaches it on Telegram. */
  telegram: string;
  status: CapabilityStatus;
  detail: string;
  /** Variables to set to move this capability up a level. */
  missing: readonly string[];
};

export type CapabilitySummary = {
  production: boolean;
  core: readonly CoreRequirement[];
  /** False when the process would fail to boot or Telegram could not connect. */
  coreOk: boolean;
  capabilities: readonly Capability[];
};

function val(env: EnvBag, name: string): string | undefined {
  const v = env[name]?.trim();
  return v ? v : undefined;
}

function firstSet(env: EnvBag, names: readonly string[]): string | undefined {
  for (const n of names) {
    const v = val(env, n);
    if (v) {
      return v;
    }
  }
  return undefined;
}

function isTrue(env: EnvBag, name: string): boolean {
  return val(env, name)?.toLowerCase() === "true";
}

function isFalsy(env: EnvBag, name: string): boolean {
  const v = val(env, name)?.toLowerCase();
  return v === "false" || v === "0";
}

const REDIS_URL_VARS = ["UPSTASH_REDIS_REST_URL", "REDIS_URL"] as const;
const REDIS_TOKEN_VARS = ["UPSTASH_REDIS_REST_TOKEN", "REDIS_TOKEN"] as const;
const GOOGLE_CALENDAR_PLATFORM_VARS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const;
const GOOGLE_YOUTUBE_PLATFORM_VARS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const;
const YOUTUBE_API_KEY_VARS = ["YOUTUBE_API_KEY", "GOOGLE_YOUTUBE_API_KEY"] as const;

function coreRequirements(env: EnvBag, production: boolean): CoreRequirement[] {
  const serviceRole = val(env, "SUPABASE_SERVICE_ROLE_KEY");
  const anon = val(env, "SUPABASE_ANON_KEY");
  const supabaseKeyOk = production ? Boolean(serviceRole) : Boolean(serviceRole || anon);

  return [
    {
      label: "Telegram bot token",
      vars: ["TELEGRAM_BOT_TOKEN"],
      ok: Boolean(val(env, "TELEGRAM_BOT_TOKEN")),
      detail: "From @BotFather. Without it the bot cannot poll Telegram.",
    },
    {
      label: "Claude API key",
      vars: ["ANTHROPIC_API_KEY"],
      ok: Boolean(val(env, "ANTHROPIC_API_KEY")),
      detail: "Every specialist reply and the intent classifier need it.",
    },
    {
      label: "Supabase URL",
      vars: ["SUPABASE_URL"],
      ok: Boolean(val(env, "SUPABASE_URL")),
      detail: "Profiles, chat history, meal logs, journals.",
    },
    {
      label: "Supabase key",
      vars: ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"],
      ok: supabaseKeyOk,
      detail: production
        ? "NODE_ENV=production requires SUPABASE_SERVICE_ROLE_KEY (RLS blocks anon)."
        : "Service role recommended even locally; anon is blocked by RLS on most tables.",
    },
    {
      label: "Redis",
      vars: [...REDIS_URL_VARS, ...REDIS_TOKEN_VARS],
      ok: Boolean(firstSet(env, REDIS_URL_VARS) && firstSet(env, REDIS_TOKEN_VARS)),
      detail: "Rate limits, update dedupe, and /menu lane selection.",
    },
  ];
}

function mealCapability(env: EnvBag): Capability {
  const webFirst = !isFalsy(env, "MAGNUS_MEAL_LOG_WEB_FIRST");
  const anthropicWebSearch = webFirst && !isFalsy(env, "MAGNUS_MEAL_ANTHROPIC_WEB_SEARCH");
  const usda = Boolean(val(env, "USDA_FDC_API_KEY"));
  const ninjas = Boolean(val(env, "CALORIENINJAS_API_KEY"));
  const llm = isTrue(env, "MAGNUS_MEAL_LOG_LLM_FALLBACK");

  const sources: string[] = [];
  if (anthropicWebSearch) {
    sources.push("web search");
  }
  if (usda) {
    sources.push("USDA FDC");
  }
  if (ninjas) {
    sources.push("CalorieNinjas");
  }
  if (llm) {
    sources.push("Claude JSON fallback");
  }

  const structured = usda || ninjas;
  const status: CapabilityStatus =
    sources.length === 0 ? "off" : structured ? "ready" : "partial";

  return {
    id: "meals",
    title: "Meal logging",
    telegram: "“log lunch: rice and dal”",
    status,
    detail:
      sources.length === 0
        ? "No nutrition source enabled — meals are still saved, but with no macros."
        : `Estimate order: ${sources.join(" → ")}.`,
    missing: structured ? [] : ["USDA_FDC_API_KEY", "CALORIENINJAS_API_KEY"],
  };
}

function morningBriefCapability(env: EnvBag): Capability {
  if (isFalsy(env, "MAGNUS_MORNING_BRIEF_ENABLED")) {
    return {
      id: "morning_brief",
      title: "Morning Brief",
      telegram: "daily push",
      status: "off",
      detail: "Disabled by MAGNUS_MORNING_BRIEF_ENABLED=false.",
      missing: ["MAGNUS_MORNING_BRIEF_ENABLED"],
    };
  }

  const proactiveCron =
    isTrue(env, "MAGNUS_PROACTIVE_CRON_ENABLED") ||
    isTrue(env, "MAGNUS_MORNING_BRIEF_CRON_ENABLED") ||
    (!isFalsy(env, "MAGNUS_PROACTIVE_CRON_ENABLED") &&
      !isFalsy(env, "MAGNUS_MORNING_BRIEF_CRON_ENABLED"));
  const briefCronOff = isFalsy(env, "MAGNUS_MORNING_BRIEF_CRON_ENABLED");
  const cron = proactiveCron && !briefCronOff;

  const missing: string[] = [];
  if (!cron) {
    missing.push("MAGNUS_PROACTIVE_CRON_ENABLED");
  }
  if (!val(env, "MAGNUS_INTERNAL_JOB_SECRET")) {
    missing.push("MAGNUS_INTERNAL_JOB_SECRET");
  }

  return {
    id: "morning_brief",
    title: "Morning Brief",
    telegram: "daily push or “morning brief”",
    status: cron ? "ready" : "partial",
    detail: cron
      ? `Scheduled around local hour ${val(env, "MAGNUS_MORNING_BRIEF_LOCAL_HOUR") ?? "7"} via proactive cron.`
      : "Proactive cron off — set MAGNUS_PROACTIVE_CRON_ENABLED=true or say “morning brief” for a manual push.",
    missing,
  };
}

function notionCapability(): Capability {
  return {
    id: "notion",
    title: "Notion journal mirror",
    telegram: "“log …”",
    status: "partial",
    detail:
      "Per-user: set notion_token and page ids in Supabase user_integrations (see scripts/upsert-user-integrations.mts). Notes always save to Supabase.",
    missing: ["user_integrations.notion_token"],
  };
}

function calendarCapability(env: EnvBag): Capability {
  const missing = GOOGLE_CALENDAR_PLATFORM_VARS.filter((name) => !val(env, name));
  if (missing.length === 0) {
    return {
      id: "calendar",
      title: "Google Calendar",
      telegram: "“what's on today?”, “book gym 7am”",
      status: "ready",
      detail:
        "OAuth app configured on the host. Each user's refresh token lives in user_integrations.",
      missing: [],
    };
  }
  return {
    id: "calendar",
    title: "Google Calendar",
    telegram: "“what's on today?”",
    status: "off",
    detail:
      "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the host; per-user refresh tokens go in user_integrations.",
    missing,
  };
}

function youtubeCapability(env: EnvBag): Capability {
  const platformOk = GOOGLE_YOUTUBE_PLATFORM_VARS.every((name) => Boolean(val(env, name)));
  const hasApiKey = Boolean(firstSet(env, YOUTUBE_API_KEY_VARS));

  if (platformOk) {
    return {
      id: "youtube",
      title: "YouTube / YT Music",
      telegram: "“connect Google”, “find a focus playlist”, “cue this song”",
      status: "partial",
      detail:
        "OAuth Web app on host. Say “connect Google” for one in-chat link (Calendar + YouTube tokens → user_integrations). Optional YOUTUBE_API_KEY for search-only.",
      missing: ["user_integrations.google_youtube_refresh_token"],
    };
  }

  if (hasApiKey) {
    return {
      id: "youtube",
      title: "YouTube / YT Music",
      telegram: "“search YouTube for …”, “recommend something to watch”",
      status: "partial",
      detail:
        "API key only — search and recommend work; playlists and likes need per-user OAuth (connect Google in chat).",
      missing: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    };
  }

  return {
    id: "youtube",
    title: "YouTube / YT Music",
    telegram: "“find a song on YouTube”",
    status: "off",
    detail:
      "Set GOOGLE_CLIENT_ID/SECRET on host; users connect in chat (or youtube:auth + upsert). Or set YOUTUBE_API_KEY for search-only.",
    missing: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  };
}

function workoutsCapability(): Capability {
  return {
    id: "workouts",
    title: "Workouts (Hevy)",
    telegram: "“should I train today?”",
    status: "partial",
    detail:
      "Per-user Hevy API key in user_integrations. Without it, coaching falls back to Supabase workouts only.",
    missing: ["user_integrations.hevy_api_key"],
  };
}

function zerodhaCapability(env: EnvBag): Capability {
  const platformOk = Boolean(
    val(env, "KITE_API_KEY") && val(env, "KITE_API_SECRET"),
  );
  if (platformOk) {
    return {
      id: "zerodha",
      title: "Zerodha (Kite Connect)",
      telegram: "“connect Zerodha”, “what are my holdings?”",
      status: "partial",
      detail:
        "Magnus Kite app on host. Each user: say “connect Zerodha” → OAuth → access token in user_integrations. Read-only portfolio today; orders gated by MAGNUS_KITE_ORDERS_ENABLED (future).",
      missing: ["user_integrations.kite_access_token"],
    };
  }
  return {
    id: "zerodha",
    title: "Zerodha (Kite Connect)",
    telegram: "“connect Zerodha”",
    status: "off",
    detail:
      "Set KITE_API_KEY + KITE_API_SECRET on the host (developers.kite.trade). Users only OAuth-login — no per-user developer signup.",
    missing: ["KITE_API_KEY", "KITE_API_SECRET"],
  };
}

function deliveryCapability(env: EnvBag): Capability {
  const runtime = resolveTelegramRuntime(env);
  if (runtime.mode === "webhook") {
    return {
      id: "delivery",
      title: "Update delivery",
      telegram: "webhook",
      status: "ready",
      detail: `Telegram posts to this host (${runtime.reason}); redeploys cannot collide.`,
      missing: [],
    };
  }
  return {
    id: "delivery",
    title: "Update delivery",
    telegram: "long polling",
    status: "partial",
    detail:
      "Only one process may poll this token — a second instance causes 409 Conflict. On a host, prefer MAGNUS_TELEGRAM_MODE=webhook.",
    missing: ["MAGNUS_TELEGRAM_MODE"],
  };
}

function accessCapability(env: EnvBag): Capability {
  const auto = isTrue(env, "MAGNUS_AUTO_ALLOWLIST_NEW_USERS");
  return {
    id: "access",
    title: "Access for new Telegram users",
    telegram: "any message",
    status: auto ? "ready" : "partial",
    detail: auto
      ? "New Telegram users are allowlisted automatically (right for a personal bot)."
      : "New users get allowlisted=false and a refusal until you flip the row in Supabase.",
    missing: auto ? [] : ["MAGNUS_AUTO_ALLOWLIST_NEW_USERS"],
  };
}

function proactiveCapability(env: EnvBag): Capability {
  const cron =
    isTrue(env, "MAGNUS_PROACTIVE_CRON_ENABLED") ||
    isTrue(env, "MAGNUS_MORNING_BRIEF_CRON_ENABLED") ||
    (!isFalsy(env, "MAGNUS_PROACTIVE_CRON_ENABLED") &&
      !isFalsy(env, "MAGNUS_MORNING_BRIEF_CRON_ENABLED"));
  const reminders =
    isTrue(env, "MAGNUS_EVENT_REMINDER_ENABLED") ||
    (!isFalsy(env, "MAGNUS_EVENT_REMINDER_ENABLED") && cron);

  return {
    id: "proactive",
    title: "Proactive messages",
    telegram: "bot-initiated sends",
    status: cron ? "ready" : "partial",
    detail: cron
      ? `Cron on (morning brief${reminders ? ", event reminders" : ""}); uses telegram_chat_id per user.`
      : "Set MAGNUS_PROACTIVE_CRON_ENABLED=true for scheduled pushes.",
    missing: cron ? [] : ["MAGNUS_PROACTIVE_CRON_ENABLED"],
  };
}

export function describeCapabilities(env: EnvBag = process.env): CapabilitySummary {
  const production = val(env, "NODE_ENV") === "production";
  const core = coreRequirements(env, production);

  const capabilities: Capability[] = [
    {
      id: "chat",
      title: "Chat + pillar routing",
      telegram: "plain text",
      status: "ready",
      detail:
        "Magnus answers everything; health, wealth, happiness and wisdom are routed silently.",
      missing: [],
    },
    workoutsCapability(),
    zerodhaCapability(env),
    mealCapability(env),
    {
      id: "journal",
      title: "Health journal",
      telegram: "“rest day, slept badly”",
      status: "ready",
      detail: "Saved to magnus_daily_logs and reused by later replies.",
      missing: [],
    },
    morningBriefCapability(env),
    notionCapability(),
    calendarCapability(env),
    youtubeCapability(env),
    proactiveCapability(env),
    accessCapability(env),
    deliveryCapability(env),
  ];

  return {
    production,
    core,
    coreOk: core.every((c) => c.ok),
    capabilities,
  };
}

/** Compact shape for a single structured boot log line. */
export function capabilityLogFields(summary: CapabilitySummary): Record<string, unknown> {
  return {
    coreOk: summary.coreOk,
    ready: summary.capabilities.filter((c) => c.status === "ready").map((c) => c.id),
    partial: summary.capabilities.filter((c) => c.status === "partial").map((c) => c.id),
    off: summary.capabilities.filter((c) => c.status === "off").map((c) => c.id),
  };
}
