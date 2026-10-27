import { GOOGLE_CALENDAR_SCOPES } from "../googleCalendar/paths.js";
import { GOOGLE_YOUTUBE_SCOPES } from "../youtube/paths.js";

/**
 * Single consent covers Calendar + YouTube. One refresh token is dual-written to
 * `google_calendar_refresh_token` and `google_youtube_refresh_token`.
 */
export const GOOGLE_UNIFIED_SCOPES = [
  ...GOOGLE_CALENDAR_SCOPES,
  ...GOOGLE_YOUTUBE_SCOPES,
] as const;
