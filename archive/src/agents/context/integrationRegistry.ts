import type { UserIntegrations } from "../../users/userIntegrations.js";
import type { UserKnowledgeIntegrations } from "../memory/userKnowledge.js";

/** Integration connectivity flags only — never secrets. */
export function buildIntegrationRegistry(
  integrations: UserIntegrations,
): UserKnowledgeIntegrations {
  return {
    notion: integrations.notionToken ? "connected" : "not_connected",
    googleCalendar: integrations.googleCalendarRefreshToken ? "connected" : "not_connected",
    youtube: integrations.googleYoutubeRefreshToken ? "connected" : "not_connected",
    hevy: integrations.hevyApiKey ? "connected" : "not_connected",
    zerodha:
      integrations.kiteAccessToken && integrations.kiteApiKey
        ? "token_set"
        : integrations.kiteApiKey
          ? "connected"
          : "not_connected",
  };
}
