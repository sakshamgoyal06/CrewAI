/**
 * Dummy env so unit tests can import `src/tools/clients.ts` without a local `.env`.
 * CI sets the same values in `.github/workflows/ci.yml`.
 */
const defaults: Record<string, string> = {
  SUPABASE_URL: "https://ci-test.supabase.co",
  SUPABASE_ANON_KEY: "ci-test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "ci-test-service-role-key",
  ANTHROPIC_API_KEY: "ci-test-anthropic-key",
  UPSTASH_REDIS_REST_URL: "https://ci-test.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "ci-test-redis-token",
  TELEGRAM_BOT_TOKEN: "ci-test-telegram-token",
};

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]?.trim()) {
    process.env[key] = value;
  }
}
