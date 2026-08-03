/**
 * Inventory Notion pages and databases reachable from configured LifeOS parents.
 *
 * Usage:
 *   NOTION_TOKEN=secret_… NOTION_DAILY_LOG_PARENT_PAGE_ID=… npx tsx scripts/audit-notion-lifeos.mts
 *
 * Or load ids from Supabase (requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
 *   TELEGRAM_USER_ID=7174221900 npx tsx scripts/audit-notion-lifeos.mts
 */
import "dotenv/config";

import { supabase } from "../src/tools/clients.js";
import { createNotionClient, listAllChildBlocks } from "../src/tools/notion.js";
import { loadNotionUserConfig } from "../src/tools/notionUser.js";

type BlockSummary = { id: string; title: string; kind: "page" | "database" | "other" };

async function resolveConfig(): Promise<{
  token: string;
  dailyLogParent?: string;
  morningBriefParent?: string;
  goalsDb?: string;
  checkinsDb?: string;
}> {
  const telegramUserId = process.env.TELEGRAM_USER_ID?.trim();
  if (telegramUserId && process.env.SUPABASE_URL?.trim()) {
    const { data: profile } = await supabase
      .from("user_profile")
      .select("id")
      .eq("telegram_chat_id", telegramUserId)
      .maybeSingle();
    if (profile?.id) {
      const cfg = await loadNotionUserConfig(profile.id);
      if (cfg?.token) {
        return {
          token: cfg.token,
          dailyLogParent: cfg.dailyLogParentPageId,
          morningBriefParent: cfg.morningBriefParentPageId,
          goalsDb: cfg.goalsDatabaseId,
          checkinsDb: cfg.dailyCheckinsDatabaseId,
        };
      }
    }
  }

  const token =
    process.env.NOTION_TOKEN?.trim() ||
    process.env.NOTION_API_KEY?.trim() ||
    process.env.NOTION_INTEGRATION_TOKEN?.trim();
  if (!token) {
    console.error(
      "Set NOTION_TOKEN or TELEGRAM_USER_ID with Supabase credentials so integrations can be loaded.",
    );
    process.exit(1);
  }

  return {
    token,
    dailyLogParent: process.env.NOTION_DAILY_LOG_PARENT_PAGE_ID?.trim(),
    morningBriefParent: process.env.NOTION_MORNING_BRIEF_PARENT_PAGE_ID?.trim(),
    goalsDb: process.env.NOTION_GOALS_DATABASE_ID?.trim(),
    checkinsDb: process.env.NOTION_DAILY_CHECKINS_DATABASE_ID?.trim(),
  };
}

async function listChildPages(client: ReturnType<typeof createNotionClient>, parentId: string) {
  if (!client) {
    return [];
  }
  const pages = await listAllChildBlocks(client, parentId);
  return pages.map((p) => ({
    id: p.id,
    title: p.child_page.title,
    kind: "page" as const,
  }));
}

async function searchDatabases(client: NonNullable<ReturnType<typeof createNotionClient>>) {
  const out: BlockSummary[] = [];
  let cursor: string | undefined;
  do {
    const res = await client.search({
      filter: { property: "object", value: "database" },
      start_cursor: cursor,
      page_size: 100,
    });
    for (const item of res.results) {
      if (item.object !== "database") {
        continue;
      }
      const title =
        "title" in item && Array.isArray(item.title)
          ? item.title.map((t) => ("plain_text" in t ? t.plain_text : "")).join("")
          : "(untitled)";
      out.push({ id: item.id, title: title || "(untitled)", kind: "database" });
    }
    cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
  } while (cursor);
  return out;
}

const cfg = await resolveConfig();
const client = createNotionClient(cfg.token);
if (!client) {
  console.error("Could not create Notion client.");
  process.exit(1);
}

console.log("=== Magnus Notion / LifeOS audit ===\n");
console.log("Configured integration ids:");
console.log("  daily_log_parent:", cfg.dailyLogParent ?? "(missing)");
console.log("  morning_brief_parent:", cfg.morningBriefParent ?? "(missing)");
console.log("  goals_database:", cfg.goalsDb ?? "(missing)");
console.log("  daily_checkins_database:", cfg.checkinsDb ?? "(missing)");
console.log();

const parentId = cfg.dailyLogParent ?? cfg.morningBriefParent;
if (parentId) {
  console.log(`Child pages under parent ${parentId}:`);
  const children = await listChildPages(client, parentId);
  if (children.length === 0) {
    console.log("  (none or integration lacks access)");
  } else {
    for (const c of children) {
      console.log(`  - [page] ${c.title}  (${c.id})`);
    }
  }
  console.log();
}

console.log("All accessible databases (workspace search):");
const dbs = await searchDatabases(client);
if (dbs.length === 0) {
  console.log("  (none — check integration page/database grants)");
} else {
  for (const db of dbs.sort((a, b) => a.title.localeCompare(b.title))) {
    const wired =
      db.id === cfg.goalsDb
        ? " ← goals (wired)"
        : db.id === cfg.checkinsDb
          ? " ← daily check-ins (wired)"
          : "";
    console.log(`  - ${db.title}  (${db.id})${wired}`);
  }
}

console.log("\nDone. Compare output with docs/NOTION_LIFEOS_STRUCTURE.md §2.4.");
