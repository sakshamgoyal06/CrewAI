/**
 * Magnus tools for per-user Notion onboarding (OAuth link or manual token).
 */
import {
  beginNotionOauth,
  notionOauthLinkAvailable,
  notionOauthRedirectConfigured,
  platformNotionOAuthReady,
} from "../../integrations/notion/oauthFlow.js";
import {
  discoverNotionLists,
  getNotionSetupStatus,
  notionConnectInstructions,
  saveNotionToken,
  setNotionHub,
  syncRegistryFromLists,
} from "../../integrations/notion/notionSetup.js";

export async function connectNotionTool(input: {
  userProfileId: string;
  telegramUserId: string;
}): Promise<string> {
  const status = await getNotionSetupStatus(input.userProfileId);

  if (status.tokenConnected && status.missingSteps.length === 0) {
    return [
      "Notion is fully set up for your account.",
      `Hub: ${status.hubPageId ?? "not set"}`,
      `Lists: ${status.listsProvisioned} provisioned, ${status.listsNotionLinked} linked to Notion.`,
      "Use list_catalog / list_items anytime. setup_notion status for details.",
    ].join("\n");
  }

  if (status.tokenConnected) {
    const parts = [
      "Notion is connected. Remaining setup:",
      ...status.missingSteps.map((s) => `- ${s}`),
      "",
      "Use setup_notion with action set_hub or discover.",
    ];
    return parts.join("\n");
  }

  if (notionOauthLinkAvailable()) {
    const started = await beginNotionOauth({
      userProfileId: input.userProfileId,
      telegramChatId: input.telegramUserId,
    });
    if (!started.ok) {
      return started.error;
    }

    return [
      "Open this link to connect Notion to Magnus (pick your LifeOS hub and list pages in the page picker; expires in about 15 minutes):",
      started.authUrl,
      "",
      "After you approve, I will save the connection for your account, auto-discover list databases, and confirm here.",
      `Register this redirect URI exactly in your Notion public connection: ${started.redirectUri}`,
    ].join("\n");
  }

  if (!platformNotionOAuthReady()) {
    return [
      notionConnectInstructions(),
      "",
      "OAuth shortcut (recommended): set NOTION_OAUTH_CLIENT_ID and NOTION_OAUTH_CLIENT_SECRET on the host, plus a public HTTPS base URL — then ask me to connect Notion again for a one-click link.",
    ].join("\n");
  }

  const redirect = notionOauthRedirectConfigured();
  return [
    "I cannot build a Notion connect link without a public HTTPS callback URL.",
    "Set MAGNUS_PUBLIC_BASE_URL (or deploy with RAILWAY_PUBLIC_DOMAIN).",
    redirect ? `Expected redirect: ${redirect}` : "",
    "",
    "Or paste an internal integration token and I will use setup_notion save_token.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function setupNotionTool(input: {
  userProfileId: string;
  action: string;
  token?: string;
  hub_page?: string;
}): Promise<string> {
  const action = input.action.trim().toLowerCase();

  switch (action) {
    case "status": {
      const status = await getNotionSetupStatus(input.userProfileId);
      const lines = [
        `Token: ${status.tokenConnected ? "connected" : "missing"}`,
        `Hub: ${status.hubPageId ?? "not set"}`,
        `Journal parent: ${status.dailyLogParent ?? "not set"}`,
        `Morning brief parent: ${status.morningBriefParent ?? "not set"}`,
        `Lists: ${status.listsProvisioned} provisioned, ${status.listsNotionLinked} Notion-linked`,
        `OAuth on host: ${notionOauthLinkAvailable() ? "ready" : "off"}`,
      ];
      if (status.missingSteps.length > 0) {
        lines.push("", "Remaining:", ...status.missingSteps.map((s) => `- ${s}`));
      } else {
        lines.push("", "Setup complete.");
      }
      return lines.join("\n");
    }
    case "save_token":
      if (!input.token?.trim()) {
        return "Provide token (internal integration secret). Prefer connect_notion for OAuth.";
      }
      return saveNotionToken(input.userProfileId, input.token);
    case "set_hub":
      if (!input.hub_page?.trim()) {
        return "Provide hub_page (LifeOS hub URL or page id).";
      }
      return setNotionHub(input.userProfileId, input.hub_page);
    case "discover":
      return discoverNotionLists(input.userProfileId);
    case "sync_registry":
      await syncRegistryFromLists(input.userProfileId);
      return "Synced notion_registry from your linked list rows.";
    default:
      return [
        `Unknown action "${input.action}".`,
        "Actions: status, save_token, set_hub, discover, sync_registry.",
      ].join("\n");
  }
}
