/**
 * "Which Magnus lanes are actually live with this environment?" — one shared answer for the
 * Telegram setup CLI (`npm run telegram:check`) and the boot log.
 *
 * Pure on purpose: every check reads an env bag passed in, so it is testable and can describe a
 * remote host's variables (e.g. pasted Railway config) as easily as `process.env`.
 */

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
const NOTION_TOKEN_VARS = [
  "NOTION_TOKEN",
  "NOTION_API_KEY",
  "NOTION_INTEGRATION_TOKEN",
] as const;
const SERPAPI_VARS = ["MAGNUS_SERPAPI_KEY", "SERPAPI_API_KEY"] as const;
const HEVY_VARS = ["HEVY_API_KEY", "MAGNUS_HEVY_API_KEY"] as const;

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
  const serp = webFirst && Boolean(firstSet(env, SERPAPI_VARS));
  const usda = Boolean(val(env, "USDA_FDC_API_KEY"));
  const ninjas = Boolean(val(env, "CALORIENINJAS_API_KEY"));
  const proxy = Boolean(val(env, "HEALTHIFYME_PROXY_URL"));
  const llm = isTrue(env, "MAGNUS_MEAL_LOG_LLM_FALLBACK");

  const sources: string[] = [];
  if (anthropicWebSearch) {
    sources.push("Anthropic web_search");
  }
  if (serp) {
    sources.push("SerpAPI");
  }
  if (usda) {
    sources.push("USDA FDC");
  }
  if (proxy) {
    sources.push("Healthify proxy");
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
    telegram: "/meal, “meal: …”",
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
      telegram: "/morningbrief",
      status: "off",
      detail: "Disabled by MAGNUS_MORNING_BRIEF_ENABLED=false.",
      missing: ["MAGNUS_MORNING_BRIEF_ENABLED"],
    };
  }

  const cron = isTrue(env, "MAGNUS_MORNING_BRIEF_CRON_ENABLED");
  const missing: string[] = [];
  if (!cron) {
    missing.push("MAGNUS_MORNING_BRIEF_CRON_ENABLED");
  }
  if (!val(env, "MAGNUS_INTERNAL_JOB_SECRET")) {
    missing.push("MAGNUS_INTERNAL_JOB_SECRET");
  }

  return {
    id: "morning_brief",
    title: "Morning Brief",
    telegram: "/morningbrief",
    status: cron ? "ready" : "partial",
    detail: cron
      ? `Scheduled in-process around local hour ${val(env, "MAGNUS_MORNING_BRIEF_LOCAL_HOUR") ?? "7"}; /morningbrief works on demand.`
      : "On demand only — set MAGNUS_MORNING_BRIEF_CRON_ENABLED=true for the daily push.",
    missing,
  };
}

function notionCapability(env: EnvBag): Capability {
  const token = firstSet(env, NOTION_TOKEN_VARS);
  const targets = [
    "NOTION_DAILY_LOG_PARENT_PAGE_ID",
    "NOTION_GOALS_DATABASE_ID",
    "NOTION_DAILY_CHECKINS_DATABASE_ID",
  ].filter((name) => Boolean(val(env, name)));

  if (!token) {
    return {
      id: "notion",
      title: "Notion LifeOS",
      telegram: "/notion",
      status: "off",
      detail: "No Notion token — the agent replies that Notion is not configured.",
      missing: ["NOTION_TOKEN"],
    };
  }

  return {
    id: "notion",
    title: "Notion LifeOS",
    telegram: "/notion",
    status: targets.length > 0 ? "ready" : "partial",
    detail:
      targets.length > 0
        ? `Token set; targets configured: ${targets.length}.`
        : "Token set but no page or database IDs — writes have nowhere to go.",
    missing:
      targets.length > 0
        ? []
        : ["NOTION_DAILY_LOG_PARENT_PAGE_ID", "NOTION_GOALS_DATABASE_ID"],
  };
}

function researchCapability(env: EnvBag): Capability {
  const serp = Boolean(firstSet(env, SERPAPI_VARS));
  return {
    id: "research",
    title: "Research",
    telegram: "/research",
    status: serp ? "ready" : "partial",
    detail: serp
      ? "Google via SerpAPI plus page fetches."
      : "Works on URLs or text you paste; no web search without a SerpAPI key.",
    missing: serp ? [] : ["MAGNUS_SERPAPI_KEY"],
  };
}

function workoutsCapability(env: EnvBag): Capability {
  const hevy = Boolean(firstSet(env, HEVY_VARS));
  return {
    id: "workouts",
    title: "Workouts (Hevy)",
    telegram: "/workouts, /hevy",
    status: hevy ? "ready" : "partial",
    detail: hevy
      ? "Reads recent Hevy sessions and routines; can create routines and log workouts."
      : "Coaching only — falls back to the Supabase `workouts` table, no Hevy reads or writes.",
    missing: hevy ? [] : ["HEVY_API_KEY"],
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
  const chatId = Boolean(val(env, "TELEGRAM_CHAT_ID"));
  return {
    id: "proactive",
    title: "Proactive messages",
    telegram: "bot-initiated sends",
    status: chatId ? "ready" : "partial",
    detail: chatId
      ? "Default chat set for Morning Brief pushes and sendMessage without an explicit chat."
      : "Replies work; scheduled pushes need a default chat id.",
    missing: chatId ? [] : ["TELEGRAM_CHAT_ID"],
  };
}

export function describeCapabilities(env: EnvBag = process.env): CapabilitySummary {
  const production = val(env, "NODE_ENV") === "production";
  const core = coreRequirements(env, production);

  const capabilities: Capability[] = [
    {
      id: "chat",
      title: "Chat + pillar routing",
      telegram: "plain text, /menu",
      status: "ready",
      detail: "Health, Wealth, Wisdom, and Joy specialists via classifier or slash command.",
      missing: [],
    },
    workoutsCapability(env),
    mealCapability(env),
    {
      id: "journal",
      title: "Health journal",
      telegram: "/journal",
      status: "ready",
      detail: "Saved to magnus_daily_logs and reused by later health replies.",
      missing: [],
    },
    morningBriefCapability(env),
    notionCapability(env),
    researchCapability(env),
    proactiveCapability(env),
    accessCapability(env),
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
