/**
 * Magnus tools for per-user Notion onboarding (OAuth link or manual token).
 */
import {
  beginNotionOauth,
  notionOauthLinkAvailable,
  notionOauthRedirectConfigured,
  platformNotionOAuthReady,
} from "../../integrations/notion/oauthFlow.js";
import { discoverNotionLists, getNotionSetupStatus, notionConnectInstructions, saveNotionToken, setNotionHub, syncRegistryFromLists } from "../../integrations/notion/notionSetup.js";
import { provisionMagnusNotionSpace } from "../../integrations/notion/notionProvision.js";

async function beginNotionOauthMessage(input: {
  userProfileId: string;
  telegramUserId: string;
  replacingExisting: boolean;
}): Promise<string> {
  const started = await beginNotionOauth({
    userProfileId: input.userProfileId,
    telegramChatId: input.telegramUserId,
  });
  if (!started.ok) {
    return started.error;
  }

  const intro = input.replacingExisting
    ? "You already have a Notion connection saved. Open this link to reconnect via OAuth:"
    : "Open this link to connect Notion to Magnus (expires in about 15 minutes):";

  return [
    intro,
    started.authUrl,
    "",
    "What to expect in Notion:",
    "• Notion will ask which pages Magnus can access — this is normal.",
    "• Magnus databases are created AFTER you click Allow access, not during the picker.",
    "• Before you open the link: create an empty page called Magnus in your workspace.",
    "• In the page picker, select that Magnus page (or any top-level page you want catalogs under).",
    "",
    "After you approve, Magnus creates the Magnus hub, Journal, and list databases automatically.",
    `Register this redirect URI exactly in your Notion public connection: ${started.redirectUri}`,
  ].join("\n");
}

export async function connectNotionTool(input: {
  userProfileId: string;
  telegramUserId: string;
}): Promise<string> {
  const status = await getNotionSetupStatus(input.userProfileId);

  // When OAuth is configured, "connect Notion" always means send a fresh consent link —
  // same as connect_google. Do not short-circuit on a stale manual token or seeded registry.
  if (notionOauthLinkAvailable()) {
    return beginNotionOauthMessage({
      ...input,
      replacingExisting: status.tokenConnected,
    });
  }

  if (status.tokenConnected && status.tokenValid && status.missingSteps.length === 0) {
    const kind =
      status.connectionKind === "oauth" ? "OAuth" : "manual integration token";
    return [
      "Notion is fully set up for your account.",
      `Connection: ${kind}`,
      `Hub: ${status.hubPageId ?? "not set"}`,
      `Lists: ${status.listsProvisioned} provisioned, ${status.listsNotionLinked} linked to Notion.`,
      "Use list_catalog / list_items anytime. setup_notion status for details.",
    ].join("\n");
  }

  if (status.tokenConnected && status.tokenValid) {
    if (
      status.listsNotionLinked === 0 ||
      status.missingSteps.some((s) => s.includes("not linked"))
    ) {
      const discover = await discoverNotionLists(input.userProfileId);
      return ["Notion is connected. Auto-linked your list databases:", "", discover].join("\n");
    }

    return [
      "Notion is connected. Remaining setup:",
      ...status.missingSteps.map((s) => `- ${s}`),
      "",
      "Try setup_notion discover or send your LifeOS hub page for set_hub.",
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
        `Token: ${status.tokenConnected ? (status.tokenValid ? "connected" : "invalid/expired") : "missing"}`,
        `Connection: ${status.connectionKind}`,
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
    case "provision":
      return provisionMagnusNotionSpace(input.userProfileId, { forceFreshHub: true });
    case "sync_registry":
      await syncRegistryFromLists(input.userProfileId);
      return "Synced notion_registry from your linked list rows.";
    default:
      return [
        `Unknown action "${input.action}".`,
        "Actions: status, save_token, set_hub, discover, provision, sync_registry.",
      ].join("\n");
  }
}
