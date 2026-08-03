import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { fiMcpFetchTimeoutMs, fiMcpStreamUrl } from "./fiEnv.js";

export type FiMcpToolResult = {
  ok: true;
  text: string;
  parsed?: unknown;
  loginRequired?: { loginUrl: string; message?: string };
};

export type FiMcpToolError = {
  ok: false;
  error: string;
  status?: number;
};

function extractTextContent(result: unknown): string {
  if (!result || typeof result !== "object") {
    return "";
  }
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
  const parts: string[] = [];
  for (const block of content ?? []) {
    if (block.type === "text" && block.text) {
      parts.push(block.text);
    }
  }
  return parts.join("\n").trim();
}

function tryParseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as unknown;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

function parseLoginRequired(parsed: unknown, raw: string): FiMcpToolResult["loginRequired"] {
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (obj.status === "login_required" && typeof obj.login_url === "string") {
      return {
        loginUrl: obj.login_url,
        message: typeof obj.message === "string" ? obj.message : undefined,
      };
    }
  }
  if (/login_required/i.test(raw) && /login_url/i.test(raw)) {
    const match = raw.match(/"login_url"\s*:\s*"([^"]+)"/);
    if (match?.[1]) {
      return { loginUrl: match[1] };
    }
  }
  return undefined;
}

export async function callFiMcpTool(
  sessionId: string,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<FiMcpToolResult | FiMcpToolError> {
  const client = new Client({ name: "magnus-fi", version: "0.0.1" });
  const transport = new StreamableHTTPClientTransport(new URL(fiMcpStreamUrl()), {
    sessionId,
  });

  const timeoutMs = fiMcpFetchTimeoutMs();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    await client.connect(transport);
    const result = await client.callTool({ name: toolName, arguments: args });
    const text = extractTextContent(result);
    const parsed = tryParseJson(text);
    const loginRequired = parseLoginRequired(parsed, text);
    return { ok: true, text, parsed, loginRequired };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
    try {
      await transport.close();
    } catch {
      // ignore close errors
    }
  }
}

export const FI_MCP_TOOLS = {
  netWorth: "fetch_net_worth",
  creditReport: "fetch_credit_report",
  bankTransactions: "fetch_bank_transactions",
  mfTransactions: "fetch_mf_transactions",
  epfDetails: "fetch_epf_details",
  stockTransactions: "fetch_stock_transactions",
} as const;
