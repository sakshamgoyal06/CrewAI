/** Fi MCP (Fi Money) — platform config. No API keys; sessions are per-user in Redis. */

export function fiMcpStreamUrl(): string {
  return process.env.MAGNUS_FI_MCP_URL?.trim() || "https://mcp.fi.money:8080/mcp/stream";
}

/** Fi passcode sessions expire ~30 minutes — match their docs. */
export function fiMcpSessionTtlSec(): number {
  const raw = process.env.MAGNUS_FI_MCP_SESSION_TTL_SEC?.trim() || "1800";
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? 1800 : n;
}

export function fiMcpFetchTimeoutMs(): number {
  const raw = process.env.MAGNUS_FI_MCP_FETCH_TIMEOUT_MS?.trim() || "20000";
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? 20000 : n;
}

export function fiMcpEnabled(): boolean {
  const v = process.env.MAGNUS_FI_MCP_ENABLED?.trim().toLowerCase();
  if (v === "false" || v === "0") {
    return false;
  }
  return true;
}
