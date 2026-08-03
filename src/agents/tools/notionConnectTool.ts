/**
 * Magnus tools for per-user Notion onboarding.
 */
import {
  discoverNotionLists,
  getNotionSetupStatus,
  notionConnectInstructions,
  saveNotionToken,
  setNotionHub,
  syncRegistryFromLists,
} from "../../integrations/notion/notionSetup.js";

export async function connectNotionTool(input: { userProfileId: string }): Promise<string> {
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
      "Notion token is connected. Remaining setup:",
      ...status.missingSteps.map((s) => `- ${s}`),
      "",
      "Use setup_notion with action set_hub or discover.",
    ];
    return parts.join("\n");
  }

  return notionConnectInstructions();
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
        return "Provide token (your Notion integration secret).";
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
