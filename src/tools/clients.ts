import { Anthropic } from "@anthropic-ai/sdk";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";

const required = (name: string, value: string | undefined): string => {
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. Set it in your environment or .env file.`,
    );
  }
  return value;
};

export const supabase: SupabaseClient = createClient(
  required("SUPABASE_URL", process.env.SUPABASE_URL),
  required("SUPABASE_ANON_KEY", process.env.SUPABASE_ANON_KEY),
);

export const redis = new Redis({
  url: required("REDIS_URL", process.env.REDIS_URL),
  token: required("REDIS_TOKEN", process.env.REDIS_TOKEN),
});

export const anthropic = new Anthropic({
  apiKey: required("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY),
});
