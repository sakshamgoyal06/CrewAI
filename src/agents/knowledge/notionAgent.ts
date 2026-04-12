/**
 * Notion specialist — `docs/AGENT_ROSTER.md` §5.5; tools in `src/tools/notion.ts`.
 */
import type { AgentContext, AgentResult, DepartmentAgent } from "../types.js";
import { recordMagnusDailyLog } from "../../tools/dailyLog.js";
import {
  appendParagraphBlocks,
  createGoalPage,
  createNotionClient,
  ensurePageForDate,
  formatDateKeyInTimeZone,
  getNotionToken,
  notionCheckinDateProperty,
  notionDailyLogParentPageId,
  notionDatabaseIdDailyCheckins,
  notionDatabaseIdGoals,
  notionGoalsTitleProperty,
  notionLogTitlePrefix,
  notionPageTitlePropertyName,
  queryDatabaseByDateProperty,
} from "../../tools/notion.js";

const READ_CHECKIN =
  /(?:today'?s|read|show|query|fetch|get)\s+(?:the\s+)?(?:daily\s+)?check[- ]?ins?|check[- ]?in\s+for\s+today|what'?s?\s+(?:in\s+)?my\s+check[- ]?in/i;

const GOAL_CREATE =
  /(?:create|add|new)\s+(?:a\s+)?(?:task|goal|item)|task\s+in\s+goals|goals?\s+database/i;

function extractNoteBody(message: string): string {
  const stripped = message
    .replace(/^\s*(?:log (?:this )?to notion|append to notion|notion|note|journal)\s*:?\s*/i, "")
    .trim();
  return stripped.length > 0 ? stripped : "(empty note)";
}

function withPatternPrefix(message: string, body: string): string {
  if (
    /\b(?:update my pattern|patterns? log|pattern\s+note)\b/i.test(message)
  ) {
    return `[Pattern] ${body}`;
  }
  return body;
}

function extractGoalTitle(message: string): string {
  const m = message.match(/(?:task|goal|item)\s*[:\-]\s*(.+)/i);
  if (m?.[1]?.trim()) {
    return m[1].trim().slice(0, 500);
  }
  return message.trim().slice(0, 500) || "New goal";
}

export async function runNotionAgent(ctx: AgentContext): Promise<AgentResult> {
  const tokenPresent = Boolean(getNotionToken());
  if (!tokenPresent) {
    return {
      text: "Notion isn’t configured on this server yet. Set NOTION_TOKEN (or NOTION_API_KEY) in the environment and restart Magnus.",
      metadata: { specialist: "Notion", department: "NOTION", configured: false },
    };
  }

  const client = createNotionClient();
  if (!client) {
    return {
      text: "Could not initialise the Notion client (missing token).",
      metadata: { specialist: "Notion", department: "NOTION", configured: false },
    };
  }

  const msg = ctx.rawMessage;
  const tz = ctx.timezone;

  if (READ_CHECKIN.test(msg)) {
    const dbId = notionDatabaseIdDailyCheckins();
    if (!dbId) {
      return {
        text:
          "To read today’s check-in, set NOTION_DAILY_CHECKINS_DATABASE_ID (and optionally NOTION_CHECKIN_DATE_PROPERTY if your date column isn’t named “Date”).",
        metadata: { specialist: "Notion", path: "query_checkin", missingEnv: true },
      };
    }
    const prop = notionCheckinDateProperty();
    const now = new Date();
    const dateKey = formatDateKeyInTimeZone(now, tz?.trim() || "UTC");
    const { pageIds, rawCount } = await queryDatabaseByDateProperty(
      client,
      dbId,
      prop,
      dateKey,
    );
    return {
      text:
        rawCount === 0
          ? `No Daily Check-in row found in Notion for **${dateKey}** (property “${prop}”).`
          : `Found **${rawCount}** check-in row(s) for **${dateKey}** (page ids: ${pageIds.join(", ")}). Open Notion to view details.`,
      metadata: {
        specialist: "Notion",
        path: "query_checkin",
        dateKey,
        pageIds,
        count: rawCount,
      },
    };
  }

  if (GOAL_CREATE.test(msg)) {
    const dbId = notionDatabaseIdGoals();
    if (!dbId) {
      return {
        text: "To create a task in Goals, set NOTION_GOALS_DATABASE_ID (and optionally NOTION_GOALS_TITLE_PROPERTY if the title column isn’t “Name”).",
        metadata: { specialist: "Notion", path: "create_goal", missingEnv: true },
      };
    }
    const title = extractGoalTitle(msg);
    const titleProp = notionGoalsTitleProperty();
    const { pageId } = await createGoalPage(client, dbId, titleProp, title);
    const dateKey = formatDateKeyInTimeZone(new Date(), tz?.trim() || "UTC");
    await recordMagnusDailyLog({
      userProfileId: ctx.userProfileId,
      logDate: dateKey,
      body: `[Goal] ${title}`,
      source: "notion",
      notionPageId: pageId,
      metadata: { path: "create_goal" },
    });
    return {
      text: `Created a Goals row in Notion: “${title}” (page ${pageId}).`,
      metadata: { specialist: "Notion", path: "create_goal", pageId, title },
    };
  }

  const parentId = notionDailyLogParentPageId();
  if (!parentId) {
    return {
      text:
        "To log notes to a dated page, set NOTION_DAILY_LOG_PARENT_PAGE_ID (a parent page Magnus can add child pages under). You can also set NOTION_LOG_TITLE_PREFIX.",
      metadata: { specialist: "Notion", path: "append_log", missingEnv: true },
    };
  }

  const body = withPatternPrefix(msg, extractNoteBody(msg));
  const { pageId, created, title } = await ensurePageForDate(
    client,
    parentId,
    new Date(),
    tz,
    notionLogTitlePrefix(),
    notionPageTitlePropertyName(),
  );
  await appendParagraphBlocks(client, pageId, [body]);

  const dateKey = formatDateKeyInTimeZone(new Date(), tz?.trim() || "UTC");
  await recordMagnusDailyLog({
    userProfileId: ctx.userProfileId,
    logDate: dateKey,
    body,
    source: "notion",
    notionPageId: pageId,
    metadata: { path: "append_log", pageTitle: title, created },
  });

  return {
    text: `${created ? "Created" : "Opened"} Notion page **${title}** and appended your note.`,
    metadata: {
      specialist: "Notion",
      path: "append_log",
      pageId,
      created,
      title,
    },
  };
}

export const notionAgent: DepartmentAgent = {
  name: "Notion",
  departmentId: "NOTION",
  run: runNotionAgent,
};
