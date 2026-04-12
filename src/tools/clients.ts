import "dotenv/config";

import { Anthropic } from "@anthropic-ai/sdk";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";

import { isProduction } from "../env.js";
import { logger } from "../logger.js";

const required = (name: string, value: string | undefined): string => {
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. Set it in your environment or .env file.`,
    );
  }
  return value;
};

const supabaseUrl = required("SUPABASE_URL", process.env.SUPABASE_URL);
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabaseAnon = process.env.SUPABASE_ANON_KEY?.trim();

if (isProduction() && !supabaseServiceRole) {
  throw new Error(
    "Production requires SUPABASE_SERVICE_ROLE_KEY (anon key alone is blocked by RLS policies).",
  );
}

const supabaseKey = supabaseServiceRole || supabaseAnon;
if (!supabaseKey) {
  throw new Error(
    "Set SUPABASE_SERVICE_ROLE_KEY for the Magnus server (required when RLS is enabled). SUPABASE_ANON_KEY alone will be blocked.",
  );
}
if (!supabaseServiceRole && supabaseAnon) {
  logger.warn(
    "Using SUPABASE_ANON_KEY; RLS policies block non–service-role access. Set SUPABASE_SERVICE_ROLE_KEY for this server.",
  );
}

const supabaseDbTimeout = Number.parseInt(
  process.env.MAGNUS_SUPABASE_DB_TIMEOUT_MS?.trim() || "30000",
  10,
);

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey, {
  db: {
    timeout: Number.isNaN(supabaseDbTimeout) ? 30000 : supabaseDbTimeout,
  },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const redisUrl =
  process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.REDIS_URL?.trim();
const redisToken =
  process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
  process.env.REDIS_TOKEN?.trim();

if (!redisUrl || !redisToken) {
  throw new Error(
    "Missing Redis config: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or REDIS_URL and REDIS_TOKEN).",
  );
}

export const redis = new Redis({
  url: redisUrl,
  token: redisToken,
});

const anthropicTimeout = Number.parseInt(
  process.env.MAGNUS_ANTHROPIC_TIMEOUT_MS?.trim() || "120000",
  10,
);
const anthropicMaxRetries = Number.parseInt(
  process.env.MAGNUS_ANTHROPIC_MAX_RETRIES?.trim() || "2",
  10,
);

export const anthropic = new Anthropic({
  apiKey: required("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY),
  timeout: Number.isNaN(anthropicTimeout) ? 120000 : anthropicTimeout,
  maxRetries: Number.isNaN(anthropicMaxRetries) ? 2 : anthropicMaxRetries,
});

logger.info(
  {
    supabaseTimeoutMs: Number.isNaN(supabaseDbTimeout) ? 30000 : supabaseDbTimeout,
    anthropicTimeoutMs: Number.isNaN(anthropicTimeout) ? 120000 : anthropicTimeout,
  },
  "clients initialized",
);
