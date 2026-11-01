/**
 * In-chat Notion OAuth: user picks workspace pages in Notion's page picker;
 * Magnus stores the access token per user and can auto-discover list databases.
 */
import { randomBytes } from "node:crypto";

import { notionOauthRedirectUri } from "../../config/publicBaseUrl.js";
import { logger } from "../../logger.js";
import { ensureUserLists } from "../../lists/listService.js";
import { prepareNotionOAuthReconnect } from "./notionSetup.js";
import { provisionMagnusNotionSpace } from "./notionProvision.js";
import { redis } from "../../tools/clients.js";
import { loggableError } from "../../util/loggableError.js";
import { upsertUserIntegrations } from "../../users/userIntegrations.js";

const STATE_TTL_SEC = 15 * 60;
const STATE_KEY_PREFIX = "magnus:notion_oauth:";
const NOTION_AUTH_URL =
  process.env.NOTION_AUTH_URL?.trim() || "https://api.notion.com/v1/oauth/authorize";
const NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token";

export type NotionOauthState = {
  userProfileId: string;
  telegramChatId: string;
  createdAt: string;
};

export type NotionTokenResponse = {
  access_token: string;
  refresh_token?: string | null;
  bot_id?: string;
  workspace_id?: string;
  workspace_name?: string | null;
  duplicated_template_id?: string | null;
};

function notionClientId(): string | undefined {
  return (
    process.env.NOTION_OAUTH_CLIENT_ID?.trim() ||
    process.env.NOTION_CLIENT_ID?.trim() ||
    process.env.OAUTH_CLIENT_ID?.trim()
  );
}

function notionClientSecret(): string | undefined {
  return (
    process.env.NOTION_OAUTH_CLIENT_SECRET?.trim() ||
    process.env.NOTION_CLIENT_SECRET?.trim() ||
    process.env.OAUTH_CLIENT_SECRET?.trim()
  );
}

export function platformNotionOAuthReady(): boolean {
  return Boolean(notionClientId() && notionClientSecret());
}

export function notionOauthLinkAvailable(): boolean {
  return platformNotionOAuthReady() && Boolean(notionOauthRedirectUri());
}

export function notionOauthRedirectConfigured(): string | null {
  return notionOauthRedirectUri();
}

async function saveState(state: string, payload: NotionOauthState): Promise<void> {
  await redis.set(`${STATE_KEY_PREFIX}${state}`, JSON.stringify(payload), {
    ex: STATE_TTL_SEC,
  });
}

async function takeState(state: string): Promise<NotionOauthState | null> {
  const key = `${STATE_KEY_PREFIX}${state}`;
  const raw = await redis.get<string>(key);
  if (!raw) {
    return null;
  }
  await redis.del(key);
  try {
    return JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw)) as NotionOauthState;
  } catch {
    return null;
  }
}

export async function beginNotionOauth(input: {
  userProfileId: string;
  telegramChatId: string;
}): Promise<{ ok: true; authUrl: string; redirectUri: string } | { ok: false; error: string }> {
  const clientId = notionClientId();
  const clientSecret = notionClientSecret();
  if (!clientId || !clientSecret) {
    return {
      ok: false,
      error:
        "Notion OAuth is not on the host. Set NOTION_OAUTH_CLIENT_ID and NOTION_OAUTH_CLIENT_SECRET from your public connection in the Notion Developer portal.",
    };
  }

  const redirectUri = notionOauthRedirectUri();
  if (!redirectUri) {
    return {
      ok: false,
      error:
        "No public HTTPS URL for the OAuth callback. Set MAGNUS_PUBLIC_BASE_URL or deploy where RAILWAY_PUBLIC_DOMAIN exists.",
    };
  }

  const state = randomBytes(24).toString("hex");
  await saveState(state, {
    userProfileId: input.userProfileId,
    telegramChatId: input.telegramChatId,
    createdAt: new Date().toISOString(),
  });

  const authUrl = new URL(NOTION_AUTH_URL);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("owner", "user");
  authUrl.searchParams.set("state", state);

  return { ok: true, authUrl: authUrl.toString(), redirectUri };
}

export type NotionOauthCallbackResult =
  | {
      ok: true;
      userProfileId: string;
      telegramChatId: string;
      workspaceName?: string | null;
      discoverSummary?: string;
    }
  | { ok: false; error: string; userFacing: string };

async function exchangeNotionCode(
  code: string,
  redirectUri: string,
): Promise<NotionTokenResponse> {
  const clientId = notionClientId();
  const clientSecret = notionClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("notion_oauth_not_configured");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(NOTION_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${basic}`,
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  const body = (await res.json()) as NotionTokenResponse & { error?: string; message?: string };
  if (!res.ok) {
    const msg = body.message || body.error || res.statusText;
    throw new Error(msg);
  }
  if (!body.access_token?.trim()) {
    throw new Error("no_access_token");
  }
  return body;
}

export async function completeNotionOauth(input: {
  code?: string | null;
  state?: string | null;
  error?: string | null;
}): Promise<NotionOauthCallbackResult> {
  if (input.error) {
    return {
      ok: false,
      error: input.error,
      userFacing: `Notion returned an error: ${input.error}. Try asking Magnus to connect Notion again.`,
    };
  }

  const code = input.code?.trim();
  const state = input.state?.trim();
  if (!code || !state) {
    return {
      ok: false,
      error: "missing_code_or_state",
      userFacing: "That link was incomplete. Ask Magnus to connect Notion again.",
    };
  }

  const payload = await takeState(state);
  if (!payload) {
    return {
      ok: false,
      error: "invalid_or_expired_state",
      userFacing:
        "That connect link expired or was already used. Ask Magnus to send a fresh Notion connect link.",
    };
  }

  const redirectUri = notionOauthRedirectUri();
  if (!redirectUri) {
    return {
      ok: false,
      error: "no_redirect_uri",
      userFacing: "OAuth callback is misconfigured on the host. Check MAGNUS_PUBLIC_BASE_URL.",
    };
  }

  try {
    const tokens = await exchangeNotionCode(code, redirectUri);

    const registry: Record<string, unknown> = {
      lists: {},
      oauth: {
        refreshToken: tokens.refresh_token ?? null,
        botId: tokens.bot_id ?? null,
        workspaceId: tokens.workspace_id ?? null,
        workspaceName: tokens.workspace_name ?? null,
        connectedAt: new Date().toISOString(),
      },
    };

    if (tokens.duplicated_template_id?.trim()) {
      registry.hubPageId = tokens.duplicated_template_id.trim();
    }

    await prepareNotionOAuthReconnect(payload.userProfileId);

    const saved = await upsertUserIntegrations({
      userProfileId: payload.userProfileId,
      notionToken: tokens.access_token.trim(),
      notionRegistry: registry,
    });

    if (!saved.ok) {
      logger.error(
        { err: saved.error, userProfileId: payload.userProfileId },
        "notion oauth: failed to store token",
      );
      return {
        ok: false,
        error: saved.error ?? "store_failed",
        userFacing: "Authorized with Notion but I could not save the token. Try again in a minute.",
      };
    }

    await ensureUserLists(payload.userProfileId);

    let discoverSummary: string | undefined;
    try {
      discoverSummary = await provisionMagnusNotionSpace(payload.userProfileId, {
        forceFreshHub: !tokens.duplicated_template_id?.trim(),
      });
    } catch (e) {
      logger.warn({ err: loggableError(e) }, "notion oauth: provision failed");
      discoverSummary =
        "Notion authorized but Magnus could not create your workspace page. Say setup_notion provision to retry.";
    }

    let syncSummary: string | undefined;
    try {
      const { syncSupabaseToNotion } = await import("./notionListSync.js");
      syncSummary = await syncSupabaseToNotion(payload.userProfileId);
    } catch (e) {
      logger.warn({ err: loggableError(e) }, "notion oauth: post-connect sync failed");
      syncSummary = "Notion connected but initial sync failed — say sync supabase to notion to retry.";
    }

    if (discoverSummary && syncSummary) {
      discoverSummary = `${discoverSummary}\n\n${syncSummary}`;
    } else if (syncSummary) {
      discoverSummary = syncSummary;
    }

    logger.info(
      { userProfileId: payload.userProfileId, workspace: tokens.workspace_name },
      "notion oauth: stored access token for user",
    );

    return {
      ok: true,
      userProfileId: payload.userProfileId,
      telegramChatId: payload.telegramChatId,
      workspaceName: tokens.workspace_name,
      discoverSummary,
    };
  } catch (e) {
    logger.warn({ err: loggableError(e) }, "notion oauth token exchange failed");
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      userFacing:
        "Notion authorization failed. Register this redirect URI exactly in your public connection settings, then try again.",
    };
  }
}
