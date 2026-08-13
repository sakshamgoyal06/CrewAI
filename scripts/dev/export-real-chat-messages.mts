/**
 * Export user messages and conversation pairs from Supabase for test suite generation.
 * Usage: npx tsx scripts/dev/export-real-chat-messages.mts
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env (or CI dummy for offline stub).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../../data/chat-samples");

type UserMessage = { content: string; intent: string | null; created_at: string };
type ConversationPair = {
  user_msg: string;
  assistant_msg: string;
  intent: string | null;
  created_at: string;
};

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  mkdirSync(outDir, { recursive: true });

  if (!url || !key || url.includes("example")) {
    console.log("No live Supabase — writing stub marker only");
    writeFileSync(
      join(outDir, "README.md"),
      "# Chat samples\n\nRun export with live Supabase credentials to refresh `real-user-messages.json`.\n",
    );
    return;
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };

  const userRes = await fetch(`${url}/rest/v1/rpc/execute_sql`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query:
        "SELECT content, intent, created_at FROM magnus_chat_messages WHERE role='user' ORDER BY created_at ASC",
    }),
  }).catch(() => null);

  // Fallback: direct REST if rpc unavailable — use PostgREST
  let userMessages: UserMessage[] = [];
  if (!userRes?.ok) {
    const rest = await fetch(
      `${url}/rest/v1/magnus_chat_messages?role=eq.user&select=content,intent,created_at&order=created_at.asc`,
      { headers: { ...headers, Prefer: "count=exact" } },
    );
    if (!rest.ok) throw new Error(`Supabase fetch failed: ${rest.status}`);
    userMessages = (await rest.json()) as UserMessage[];
  }

  const pairRes = await fetch(
    `${url}/rest/v1/rpc/execute_sql`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: `SELECT u.content as user_msg, a.content as assistant_msg, a.intent, u.created_at
          FROM magnus_chat_messages u
          JOIN LATERAL (
            SELECT content, intent FROM magnus_chat_messages a
            WHERE a.user_profile_id = u.user_profile_id AND a.role = 'assistant'
              AND a.created_at > u.created_at AND a.message_type = 'conversation'
            ORDER BY a.created_at ASC LIMIT 1
          ) a ON true
          WHERE u.role = 'user' AND u.message_type = 'conversation'
          ORDER BY u.created_at ASC`,
      }),
    },
  ).catch(() => null);

  let pairs: ConversationPair[] = [];
  if (pairRes?.ok) {
    const data = (await pairRes.json()) as { result?: ConversationPair[] };
    pairs = data.result ?? (data as unknown as ConversationPair[]);
  }

  writeFileSync(join(outDir, "real-user-messages.json"), JSON.stringify(userMessages, null, 2));
  writeFileSync(join(outDir, "conversation-pairs.json"), JSON.stringify(pairs, null, 2));
  console.log(`Exported ${userMessages.length} user messages, ${pairs.length} pairs → ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
