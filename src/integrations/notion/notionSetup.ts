/**
 * Per-user Notion onboarding: token validation, hub setup, database discovery.
 */
import type { Client } from "@notionhq/client";

import { logger } from "../../logger.js";
import { ensureUserLists, linkNotionList } from "../../lists/listService.js";
import { getStandardTemplate, STANDARD_LIST_TEMPLATES } from "../../lists/listCatalog.js";
import {
  fetchUserLists,
  updateList,
} from "../../lists/listStore.js";
import { createNotionClient } from "../../tools/notion.js";
import type { NotionRegistry } from "../../tools/notionRegistry.js";
import { loadUserIntegrations, upsertUserIntegrations } from "../../users/userIntegrations.js";
import { loggableError } from "../../util/loggableError.js";
import { parseNotionId } from "./notionId.js";

export { parseNotionId } from "./notionId.js";

export type NotionConnectionKind = "oauth" | "manual" | "none";

export type NotionSetupStatus = {
  tokenConnected: boolean;
  tokenValid: boolean;
  connectionKind: NotionConnectionKind;
  workspaceName?: string;
  hubPageId?: string;
  dailyLogParent?: string;
  morningBriefParent?: string;
  listsProvisioned: number;
  listsNotionLinked: number;
  missingSteps: string[];
};

export function notionConnectionKind(registry: unknown): NotionConnectionKind {
  if (!registry || typeof registry !== "object") {
    return "none";
  }
  const oauth = (registry as Record<string, unknown>).oauth;
  if (
    oauth &&
    typeof oauth === "object" &&
    typeof (oauth as { connectedAt?: string }).connectedAt === "string"
  ) {
    return "oauth";
  }
  return "none";
}

export async function validateNotionToken(
  token: string,
): Promise<{ ok: true; workspaceName?: string } | { ok: false; error: string }> {
  const client = createNotionClient(token.trim());
  if (!client) {
    return { ok: false, error: "Token was empty." };
  }
  try {
    const me = await client.users.me({});
    const workspaceName =
      me.type === "bot" && "bot" in me && me.bot && "owner" in me.bot
        ? undefined
        : undefined;
    return { ok: true, workspaceName };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Notion rejected the token.",
    };
  }
}

export async function getNotionSetupStatus(userProfileId: string): Promise<NotionSetupStatus> {
  const integrations = await loadUserIntegrations(userProfileId);
  const lists = await fetchUserLists(userProfileId);
  const listRows = lists.ok ? lists.data : [];
  const registry = integrations.notionRegistry as NotionRegistry | undefined;

  const missingSteps: string[] = [];
  let tokenValid = false;
  let connectionKind: NotionConnectionKind = "none";

  if (!integrations.notionToken) {
    missingSteps.push("Connect Notion (say connect Notion for OAuth, or setup_notion save_token).");
  } else {
    const validated = await validateNotionToken(integrations.notionToken);
    tokenValid = validated.ok;
    if (!validated.ok) {
      missingSteps.push(
        "Notion token is invalid or expired — say connect Notion to reconnect.",
      );
    }
    connectionKind = notionConnectionKind(integrations.notionRegistry);
    if (connectionKind === "none") {
      connectionKind = "manual";
    }
  }

  if (tokenValid && !registry?.hubPageId && !integrations.notionDailyLogParentPageId) {
    missingSteps.push("Set your LifeOS hub page (OAuth page picker or setup_notion set_hub).");
  }
  if (tokenValid && listRows.filter((l) => l.notion_data_source_id).length === 0) {
    missingSteps.push("List databases not linked yet — connect Notion runs auto-discover.");
  }

  return {
    tokenConnected: Boolean(integrations.notionToken),
    tokenValid,
    connectionKind,
    hubPageId: registry?.hubPageId ?? integrations.notionDailyLogParentPageId,
    dailyLogParent: integrations.notionDailyLogParentPageId,
    morningBriefParent: integrations.notionMorningBriefParentPageId,
    listsProvisioned: listRows.length,
    listsNotionLinked: listRows.filter((l) => l.notion_data_source_id).length,
    missingSteps,
  };
}

export async function saveNotionToken(
  userProfileId: string,
  token: string,
): Promise<string> {
  const trimmed = token.trim();
  if (!trimmed.startsWith("secret_") && !trimmed.startsWith("ntn_")) {
    return "That does not look like a Notion integration token — it should start with secret_ or ntn_.";
  }

  const validated = await validateNotionToken(trimmed);
  if (!validated.ok) {
    return `Notion rejected the token: ${validated.error}`;
  }

  const saved = await upsertUserIntegrations({
    userProfileId,
    notionToken: trimmed,
  });
  if (!saved.ok) {
    return `Could not save token: ${saved.error}`;
  }

  await ensureUserLists(userProfileId);

  let discoverSummary = "";
  try {
    const { provisionMagnusNotionSpace } = await import("./notionProvision.js");
    discoverSummary = await provisionMagnusNotionSpace(userProfileId);
  } catch (e) {
    logger.warn({ err: loggableError(e) }, "notion save_token: provision failed");
    try {
      discoverSummary = await discoverNotionLists(userProfileId);
    } catch (e2) {
      logger.warn({ err: loggableError(e2) }, "notion save_token: auto-discover failed");
    }
  }

  const who = validated.workspaceName ? ` (${validated.workspaceName})` : "";
  const parts = [
    `Notion connected${who}. Token saved for your account only.`,
    "",
    "Share your LifeOS hub and list databases with this integration in Notion, then send the hub page link if journal mirroring needs a parent page.",
  ];
  if (discoverSummary) {
    parts.push("", discoverSummary);
  }
  return parts.join("\n");
}

export async function setNotionHub(
  userProfileId: string,
  hubPageIdOrUrl: string,
): Promise<string> {
  const integrations = await loadUserIntegrations(userProfileId);
  if (!integrations.notionToken) {
    return "Connect Notion first — use setup_notion save_token with your integration token.";
  }

  const hubId = parseNotionId(hubPageIdOrUrl);
  if (!hubId) {
    return "Could not parse a Notion page id from that input — paste the full page URL or UUID.";
  }

  const client = createNotionClient(integrations.notionToken);
  if (!client) {
    return "Notion client could not be created.";
  }

  try {
    await client.pages.retrieve({ page_id: hubId });
  } catch (e) {
    return `Cannot access that page — share it with your Notion integration first. (${e instanceof Error ? e.message : String(e)})`;
  }

  const registry = (integrations.notionRegistry as NotionRegistry | undefined) ?? { lists: {} };
  registry.hubPageId = hubId;

  const saved = await upsertUserIntegrations({
    userProfileId,
    notionDailyLogParentPageId: hubId,
    notionMorningBriefParentPageId: hubId,
    notionRegistry: registry as Record<string, unknown>,
  });
  if (!saved.ok) {
    return `Could not save hub: ${saved.error}`;
  }

  await ensureUserLists(userProfileId);

  let discoverSummary = "";
  try {
    const { provisionMagnusNotionSpace } = await import("./notionProvision.js");
    discoverSummary = await provisionMagnusNotionSpace(userProfileId);
  } catch (e) {
    logger.warn({ err: loggableError(e) }, "notion set_hub: provision failed");
    try {
      discoverSummary = await discoverNotionLists(userProfileId);
    } catch (e2) {
      logger.warn({ err: loggableError(e2) }, "notion set_hub: auto-discover failed");
    }
  }

  const parts = [
    `LifeOS hub set (${hubId}).`,
    "Journal and Morning Brief pages will be created under this hub.",
  ];
  if (discoverSummary) {
    parts.push("", discoverSummary);
  } else {
    parts.push("List databases will auto-link when you connect Notion or run setup_notion discover.");
  }
  return parts.join("\n");
}

type DiscoveredDatabase = { id: string; title: string };

async function searchAccessibleDatabases(client: Client): Promise<DiscoveredDatabase[]> {
  const out: DiscoveredDatabase[] = [];
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
      out.push({ id: item.id, title: title || "(untitled)" });
    }
    cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
  } while (cursor);
  return out;
}

const SLUG_TITLE_PATTERNS: Record<string, RegExp[]> = {
  watchlist: [/watch/i, /movie/i, /film/i, /show/i],
  readlist: [/read/i, /book/i],
  travel: [/travel/i, /trip/i, /wishlist/i],
  food: [/food/i, /restaurant/i, /dish/i],
  music: [/music/i, /listen/i, /album/i],
  tasks: [/life task/i, /\btask/i, /todo/i, /open loop/i],
  goals: [/goal/i, /milestone/i],
  patterns: [/pattern/i],
  checkins: [/check.?in/i, /daily check/i],
  experiences: [/experience/i, /joy event/i],
};

function scoreDatabaseForSlug(title: string, slug: string): number {
  const patterns = SLUG_TITLE_PATTERNS[slug];
  if (!patterns) {
    return 0;
  }
  let score = 0;
  for (const re of patterns) {
    if (re.test(title)) {
      score += 10;
    }
  }
  const template = getStandardTemplate(slug);
  if (template && title.toLowerCase().includes(template.displayName.toLowerCase())) {
    score += 5;
  }
  return score;
}

function inferTitleProperty(props: Record<string, unknown>): string {
  for (const [name, val] of Object.entries(props)) {
    if (val && typeof val === "object" && (val as { type?: string }).type === "title") {
      return name;
    }
  }
  return "Title";
}

function inferStatusProperty(props: Record<string, unknown>): {
  name?: string;
  kind: "select" | "status";
} {
  for (const [name, val] of Object.entries(props)) {
    if (!val || typeof val !== "object") {
      continue;
    }
    const type = (val as { type?: string }).type;
    if (type === "status") {
      return { name, kind: "status" };
    }
    if (type === "select" && /status/i.test(name)) {
      return { name, kind: "select" };
    }
  }
  return { kind: "select" };
}

/** Clear per-list Notion mirror ids before OAuth reconnect + rediscover. */
export async function clearNotionListMirrors(userProfileId: string): Promise<void> {
  const lists = await fetchUserLists(userProfileId);
  if (!lists.ok) {
    return;
  }
  for (const list of lists.data) {
    if (list.notion_data_source_id) {
      await updateList(list.id, { notionDataSourceId: null });
    }
  }
}

export async function discoverNotionLists(userProfileId: string): Promise<string> {
  const integrations = await loadUserIntegrations(userProfileId);
  if (!integrations.notionToken) {
    return "Connect Notion first — setup_notion save_token.";
  }

  const client = createNotionClient(integrations.notionToken);
  if (!client) {
    return "Notion client could not be created.";
  }

  await ensureUserLists(userProfileId);

  let databases: DiscoveredDatabase[];
  try {
    databases = await searchAccessibleDatabases(client);
  } catch (e) {
    logger.warn({ err: loggableError(e) }, "notion database search failed");
    return `Could not search Notion databases: ${e instanceof Error ? e.message : String(e)}`;
  }

  if (databases.length === 0) {
    return "No databases found — share your LifeOS list databases with the integration in Notion.";
  }

  const assigned = new Map<string, DiscoveredDatabase>();
  for (const slug of STANDARD_LIST_TEMPLATES.map((t) => t.slug)) {
    let best: { db: DiscoveredDatabase; score: number } | null = null;
    for (const db of databases) {
      if (assigned.has(db.id)) {
        continue;
      }
      const score = scoreDatabaseForSlug(db.title, slug);
      if (score > 0 && (!best || score > best.score)) {
        best = { db, score };
      }
    }
    if (best && best.score >= 10) {
      assigned.set(best.db.id, best.db);
      const template = getStandardTemplate(slug)!;

      let titleProperty = template.notionTitleProperty;
      let statusProperty = template.notionStatusProperty;
      let statusKind = template.notionStatusKind;

      try {
        const schema = await client.databases.retrieve({ database_id: best.db.id });
        if ("properties" in schema && schema.properties) {
          titleProperty = inferTitleProperty(schema.properties as Record<string, unknown>);
          const status = inferStatusProperty(schema.properties as Record<string, unknown>);
          if (status.name) {
            statusProperty = status.name;
            statusKind = status.kind;
          }
        }
      } catch {
        // use template defaults
      }

      await linkNotionList({
        userProfileId,
        slug,
        notionDatabaseId: best.db.id,
        titleProperty,
        statusProperty,
        statusKind,
      });
    }
  }

  await syncRegistryFromLists(userProfileId);

  const lists = await fetchUserLists(userProfileId);
  const linked = lists.ok ? lists.data.filter((l) => l.notion_data_source_id) : [];
  const lines = linked.map((l) => `${l.slug} ← ${l.display_name}`);
  const unlinked = lists.ok
    ? lists.data.filter((l) => !l.notion_data_source_id && l.slug !== "experiences")
    : [];

  const parts = [
    `Discovered ${linked.length} list database(s):`,
    lines.length ? lines.join("\n") : "(none matched by title — use link_notion_list manually)",
  ];
  if (unlinked.length > 0) {
    parts.push("", `Still Supabase-only: ${unlinked.map((l) => l.slug).join(", ")}`);
  }
  parts.push("", "Lists work in Supabase either way; Notion mirror is optional.");
  return parts.join("\n");
}

/** Write notion_registry JSONB from linked magnus_user_lists rows. */
export async function syncRegistryFromLists(userProfileId: string): Promise<void> {
  const integrations = await loadUserIntegrations(userProfileId);
  const lists = await fetchUserLists(userProfileId);
  if (!lists.ok) {
    return;
  }

  const registry: NotionRegistry = {
    hubPageId:
      (integrations.notionRegistry as NotionRegistry | undefined)?.hubPageId ??
      integrations.notionDailyLogParentPageId,
    lists: {},
  };

  for (const list of lists.data) {
    if (!list.notion_data_source_id) {
      continue;
    }
    registry.lists[list.slug] = {
      dataSourceId: list.notion_data_source_id,
      titleProperty: list.notion_title_property,
      statusProperty: list.notion_status_property ?? undefined,
      defaultStatus: list.default_status ?? undefined,
      openStatuses: list.open_statuses,
    };
  }

  if (integrations.notionGoalsDatabaseId && registry.lists.goals) {
    registry.lists.goals.dataSourceId = integrations.notionGoalsDatabaseId;
  }
  if (integrations.notionDailyCheckinsDatabaseId && registry.lists.checkins) {
    registry.lists.checkins.dataSourceId = integrations.notionDailyCheckinsDatabaseId;
  }

  await upsertUserIntegrations({
    userProfileId,
    notionRegistry: registry as Record<string, unknown>,
  });
}

export async function resetUserListArchitecture(userProfileId: string): Promise<string> {
  const { supabase } = await import("../../tools/clients.js");

  await supabase.from("magnus_list_items").delete().eq("user_profile_id", userProfileId);
  await supabase.from("magnus_user_lists").delete().eq("user_profile_id", userProfileId);

  const lists = await ensureUserLists(userProfileId);
  await syncRegistryFromLists(userProfileId);

  return `Reset list architecture: ${lists.length} standard lists provisioned, registry synced.`;
}

export function notionConnectInstructions(): string {
  return [
    "To connect Notion to Magnus (your token stays on your account only):",
    "",
    "**Preferred:** say connect Notion — OAuth link; Magnus creates a dedicated Magnus page with list catalogs and journal.",
    "",
    "**Manual fallback:**",
    "1. Open https://www.notion.so/my-integrations and create an internal integration.",
    "2. Copy the Internal Integration Secret (starts with secret_ or ntn_).",
    "3. setup_notion action save_token with the secret.",
    "4. setup_notion action provision to create the Magnus space and list databases.",
    "",
    "Lists work in Magnus without Notion; connecting adds a mirror in your workspace.",
    "See docs/NOTION_SETUP.md for OAuth redirect URI setup.",
  ].join("\n");
}
