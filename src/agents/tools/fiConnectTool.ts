/**
 * Magnus tool + wealth fast-path: connect Fi Money (banks, cards, net worth).
 */
import { beginFiMcpConnect, clearFiMcpSession, fetchFiWealthSnapshot, fiMcpEnabled } from "../../pillars/wealth/fi/index.js";

const CONNECT_PATTERN =
  /\b(connect|link|login|sign in to|sign-in to|reconnect|refresh)\b.*\b(fi(?:\s+money)?|fi\s+mcp)\b|\b(fi(?:\s+money)?|fi\s+mcp)\b.*\b(connect|link|reconnect)\b/i;

const CONNECTED_PATTERN = /\bfi\s+connected\b|\bdone\s+fi\b|\bconnected\s+fi\b/i;

const DISCONNECT_PATTERN =
  /\b(disconnect|unlink|log\s?out|clear)\b.*\b(fi(?:\s+money)?|fi\s+mcp)\b|\b(fi(?:\s+money)?|fi\s+mcp)\b.*\b(disconnect|unlink)\b/i;

export function isFiConnectRequest(message: string): boolean {
  return CONNECT_PATTERN.test(message.trim());
}

export function isFiConnectedAck(message: string): boolean {
  return CONNECTED_PATTERN.test(message.trim());
}

export function isFiDisconnectRequest(message: string): boolean {
  return DISCONNECT_PATTERN.test(message.trim());
}

export async function connectFiTool(input: { userProfileId: string }): Promise<string> {
  if (!fiMcpEnabled()) {
    return "Fi Money integration is disabled on this host (MAGNUS_FI_MCP_ENABLED=false).";
  }

  const started = await beginFiMcpConnect(input.userProfileId);
  if (!started.ok) {
    return `Could not reach Fi Money: ${started.error}. Try again in a few minutes.`;
  }

  if (started.alreadyConnected) {
    return (
      "Fi Money is already connected — I can see your net worth and recent bank/credit data for wealth coaching.\n" +
      "Sessions expire after ~30 minutes; say \"connect Fi\" again if data stops loading."
    );
  }

  return [
    "Connect Fi Money to Magnus (read-only):",
    "",
    started.instructions,
    "",
    started.loginUrl,
    "",
    "Passcode: Fi app → Net Worth → Talk to AI → Get Passcode (valid ~30 min).",
    "",
    "When finished in the browser, reply: fi connected",
  ].join("\n");
}

export async function acknowledgeFiConnected(input: { userProfileId: string }): Promise<string> {
  const res = await fetchFiWealthSnapshot(input.userProfileId);
  if (res.ok) {
    const total = res.snapshot.netWorth?.totalNetWorth?.units;
    const suffix = total ? ` Net worth loaded: ₹${Number(total).toLocaleString("en-IN")}.` : "";
    return `Fi Money is connected.${suffix} I will use this for wealth coaching until the session expires (~30 min).`;
  }
  if (!res.ok && res.error === "login_required" && "loginUrl" in res) {
    return [
      "Fi login is not complete yet. Open this URL, finish phone + passcode, then reply fi connected:",
      res.loginUrl,
    ].join("\n");
  }
  return `Fi connect did not finish: ${res.error}. Say "connect Fi" to try again.`;
}

export async function disconnectFiTool(input: { userProfileId: string }): Promise<string> {
  await clearFiMcpSession(input.userProfileId);
  return "Fi Money session cleared for Magnus. Say \"connect Fi\" to link again.";
}
