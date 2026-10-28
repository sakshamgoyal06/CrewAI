/**
 * Archive duplicate LifeOS list databases and old Morning Brief pages in Notion.
 *
 * Keeps canonical Title Case databases under the LifeOS hub; archives lowercase
 * duplicates created by failed Magnus provision runs.
 *
 * Usage:
 *   TELEGRAM_USER_ID=7174221900 npx tsx scripts/cleanup-notion-lifeos.mts
 *   NOTION_TOKEN=ntn_… npx tsx scripts/cleanup-notion-lifeos.mts --hub 32cb455a-f233-811b-9e29-fcd84f710759
 *
 * Options:
 *   --dry-run          Print actions without archiving
 *   --hub <page-id>    LifeOS hub page (default: OWNER_NOTION_REGISTRY_REFERENCE.hubPageId)
 *   --skip-briefs      Do not archive old Morning Brief pages
 */
import "dotenv/config";

import { supabase } from "../src/tools/clients.js";
import { createNotionClient } from "../src/tools/notion.js";
import { OWNER_NOTION_REGISTRY_REFERENCE } from "../src/tools/notionRegistry.js";
import { loadNotionUserConfig } from "../src/tools/notionUser.js";

const DUPLICATE_TITLE_PATTERNS = [
  /^🎬 Watchlist$/i,
  /^📚 Reading list$/i,
  /^✈️ Travel wishlist$/i,
  /^🍜 Food wishlist$/i,
  /^🎵 Music list$/i,
  /^✅ Life tasks$/i,
  /^🔍 Patterns$/,
];

const KEEP_BRIEF_IDS = new Set([
  "32cb455a-f233-81cc-ae99-e08f6b76b983", // template
]);

function parseArgs() {
  const args = process.argv.slice(2);
  let dryRun = false;
  let skipBriefs = false;
  let hub = OWNER_NOTION_REGISTRY_REFERENCE.hubPageId;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--dry-run") {
      dryRun = true;
    } else if (a === "--skip-briefs") {
      skipBriefs = true;
    } else if (a === "--hub" && args[i + 1]) {
      hub = args[++i]!;
    }
  }
  return { dryRun, skipBriefs, hub };
}

async function resolveToken(): Promise<string> {
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
        return cfg.token;
      }
    }
  }
  const token =
    process.env.NOTION_TOKEN?.trim() ||
    process.env.NOTION_API_KEY?.trim() ||
    process.env.NOTION_INTEGRATION_TOKEN?.trim();
  if (!token) {
    console.error("Set NOTION_TOKEN or TELEGRAM_USER_ID with Supabase credentials.");
    process.exit(1);
  }
  return token;
}

async function archiveDatabase(
  client: NonNullable<ReturnType<typeof createNotionClient>>,
  id: string,
  title: string,
  dryRun: boolean,
): Promise<boolean> {
  if (dryRun) {
    console.log(`[dry-run] archive database: ${title} (${id})`);
    return true;
  }
  try {
    await client.databases.update({ database_id: id, archived: true });
    console.log(`archived database: ${title}`);
    return true;
  } catch (e) {
    console.warn(`failed database ${title}: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

async function archivePage(
  client: NonNullable<ReturnType<typeof createNotionClient>>,
  id: string,
  title: string,
  dryRun: boolean,
): Promise<boolean> {
  if (dryRun) {
    console.log(`[dry-run] archive page: ${title} (${id})`);
    return true;
  }
  try {
    await client.pages.update({ page_id: id, archived: true });
    console.log(`archived page: ${title}`);
    return true;
  } catch (e) {
    console.warn(`failed page ${title}: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

function pageTitle(item: { properties?: Record<string, unknown> }): string {
  const props = item.properties ?? {};
  for (const val of Object.values(props)) {
    if (val && typeof val === "object" && (val as { type?: string }).type === "title") {
      const title = (val as { title?: Array<{ plain_text?: string }> }).title ?? [];
      return title.map((t) => t.plain_text ?? "").join("");
    }
  }
  return "(untitled)";
}

const { dryRun, skipBriefs, hub } = parseArgs();
const token = await resolveToken();
const client = createNotionClient(token);
if (!client) {
  console.error("Could not create Notion client.");
  process.exit(1);
}

console.log(`LifeOS cleanup — hub ${hub}${dryRun ? " (dry-run)" : ""}\n`);

// 1) Archive duplicate databases (workspace search)
const search = await client.search({
  filter: { property: "object", value: "database" },
  page_size: 100,
});
let dbArchived = 0;
for (const item of search.results) {
  if (item.object !== "database") {
    continue;
  }
  const title =
    "title" in item && Array.isArray(item.title)
      ? item.title.map((t) => ("plain_text" in t ? t.plain_text : "")).join("")
      : "";
  if (!DUPLICATE_TITLE_PATTERNS.some((re) => re.test(title))) {
    continue;
  }
  if (await archiveDatabase(client, item.id, title, dryRun)) {
    dbArchived++;
  }
}
console.log(`\nDuplicate databases archived: ${dbArchived}`);

// 2) Archive old Morning Brief pages under hub (keep template + two newest)
if (!skipBriefs && hub) {
  const children = await client.blocks.children.list({ block_id: hub, page_size: 100 });
  const briefPages: Array<{ id: string; title: string }> = [];
  for (const block of children.results) {
    if (block.type !== "child_page") {
      continue;
    }
    const title = block.child_page.title;
    if (/^☀️ Morning Brief —/.test(title)) {
      briefPages.push({ id: block.id, title });
    }
  }

  briefPages.sort((a, b) => b.title.localeCompare(a.title));
  const keepIds = new Set(KEEP_BRIEF_IDS);
  for (const page of briefPages.slice(0, 2)) {
    keepIds.add(page.id);
  }

  let briefArchived = 0;
  for (const page of briefPages) {
    if (keepIds.has(page.id)) {
      console.log(`keeping brief: ${page.title}`);
      continue;
    }
    if (await archivePage(client, page.id, page.title, dryRun)) {
      briefArchived++;
    }
  }
  console.log(`\nOld Morning Brief pages archived: ${briefArchived}`);
}

console.log("\nDone. Re-run scripts/audit-notion-lifeos.mts to verify.");
