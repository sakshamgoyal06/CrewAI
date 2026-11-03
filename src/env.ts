export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function healthListenPort(): number {
  const raw = process.env.HEALTH_PORT?.trim() || process.env.PORT?.trim();
  const p = raw ? Number.parseInt(raw, 10) : 8080;
  return Number.isNaN(p) || p < 1 ? 8080 : p;
}
