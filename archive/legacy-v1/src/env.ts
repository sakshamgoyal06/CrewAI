export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Max inbound Telegram text messages per user per sliding minute (0 = disabled). */
export function rateLimitPerMinute(): number {
  const raw = process.env.MAGNUS_RATE_LIMIT_PER_MINUTE?.trim();
  if (raw === undefined || raw === "") {
    return 30;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) {
    return 30;
  }
  return n;
}

export function healthListenPort(): number {
  const raw = process.env.HEALTH_PORT?.trim() || process.env.PORT?.trim();
  const p = raw ? Number.parseInt(raw, 10) : 8080;
  return Number.isNaN(p) || p < 1 ? 8080 : p;
}
