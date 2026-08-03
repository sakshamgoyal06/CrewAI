/**
 * Probe Fi MCP server — list tools and test unauthenticated call.
 * Usage: npx tsx scripts/wealth/fi/probe-fi-mcp.mts [passcode]
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const passcode = process.argv[2]?.trim();
const url = process.env.MAGNUS_FI_MCP_URL?.trim() || "https://mcp.fi.money:8080/mcp/stream";

const client = new Client({ name: "magnus-fi-probe", version: "0.0.1" });
const transport = new StreamableHTTPClientTransport(new URL(url));

await client.connect(transport);
const tools = await client.listTools();
console.log(
  JSON.stringify(
    tools.tools.map((t) => ({ name: t.name, description: t.description?.slice(0, 120) })),
    null,
    2,
  ),
);

for (const toolName of ["fetch_net_worth", "networth:fetch_net_worth", "authenticate", "login"]) {
  try {
    const args: Record<string, unknown> = {};
    if (passcode && /auth|login/i.test(toolName)) {
      args.passcode = passcode;
    }
    if (passcode && toolName.includes("fetch")) {
      args.passcode = passcode;
    }
    const res = await client.callTool({ name: toolName, arguments: args });
    console.log(`\n=== ${toolName} ===`);
    console.log(JSON.stringify(res, null, 2).slice(0, 2000));
  } catch (e) {
    console.log(`\n=== ${toolName} ERROR ===`, e instanceof Error ? e.message : e);
  }
}

await transport.close();
