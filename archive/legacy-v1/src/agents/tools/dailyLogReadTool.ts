/**
 * Unified read for what the user logged on a given day.
 */
import { supabase } from "../../tools/clients.js";
import { listEventsTool } from "./eventLogTool.js";
import { getDailyCheckin } from "../../lists/listService.js";

export async function getDailyLog(input: {
  userProfileId: string;
  date?: string;
  timeZone?: string;
}): Promise<string> {
  const timeZone = input.timeZone?.trim() || "UTC";
  const dateKey = input.date?.trim() || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return "date must be YYYY-MM-DD.";
  }

  const sections: string[] = [`**Daily log — ${dateKey}**`];

  const { data: notes, error } = await supabase
    .from("magnus_daily_logs")
    .select("body, source, created_at, metadata")
    .eq("user_profile_id", input.userProfileId)
    .eq("log_date", dateKey)
    .order("created_at", { ascending: true });

  if (error) {
    sections.push(`Notes: could not load (${error.message}).`);
  } else if (!notes?.length) {
    sections.push("Notes: none.");
  } else {
    const lines = notes.map((row) => {
      const body = typeof row.body === "string" ? row.body.trim() : "";
      const source = typeof row.source === "string" ? row.source : "telegram";
      const meta = row.metadata as { health_journal?: boolean } | null;
      const tag = meta?.health_journal ? " (health journal)" : "";
      return `- [${source}${tag}] ${body}`;
    });
    sections.push("**Notes**", lines.join("\n"));
  }

  const checkin = await getDailyCheckin({
    userProfileId: input.userProfileId,
    date: dateKey,
  });
  sections.push("", "**Check-in**", checkin);

  const commitments = await listEventsTool({
    userProfileId: input.userProfileId,
    timeZone,
    from: dateKey,
    to: dateKey,
    limit: 20,
  });
  sections.push("", "**Commitments**", commitments);

  return sections.join("\n");
}
