import { isNotionIntentOverride } from "../agents/knowledge/notionIntent.js";
import { fetchLastDisambiguationAssistant } from "../tools/chatLog.js";

const PLANNING_HINT =
  /\b(plan|week|schedule|calendar|roadmap|prioritiz|okr|gtd|deadline|block time|time block)\b/i;
const RESEARCH_HINT =
  /\b(research|compare|sources|summarize|versus|vs\.?|literature|papers|citations?|deep dive)\b/i;

/** How long after a disambiguation prompt we accept "1" / "2" follow-ups. */
export const DISAMBIGUATION_FOLLOWUP_TTL_MS = 30 * 60 * 1000;

/** Parses a short reply to the planning-vs-research disambiguation prompt. */
export function parseDisambiguationChoice(text: string): "1" | "2" | null {
  const t = text.trim().toLowerCase();
  if (/^(1|one|first)\s*[\.\)]?\s*$/.test(t)) {
    return "1";
  }
  if (/^(2|two|second)\s*[\.\)]?\s*$/.test(t)) {
    return "2";
  }
  return null;
}

export type DisambiguationFollowUp = {
  originalUserMessage: string;
  choice: "1" | "2";
};

/**
 * If the user is answering a recent disambiguation prompt with "1" or "2", return the
 * routed message and choice so the orchestrator can skip classification.
 */
export async function resolveDisambiguationFollowUp(
  userProfileId: string,
  currentUserMessage: string,
): Promise<DisambiguationFollowUp | null> {
  const choice = parseDisambiguationChoice(currentUserMessage);
  if (!choice) {
    return null;
  }
  const last = await fetchLastDisambiguationAssistant(userProfileId);
  if (!last) {
    return null;
  }
  const age = Date.now() - new Date(last.createdAt).getTime();
  if (age > DISAMBIGUATION_FOLLOWUP_TTL_MS) {
    return null;
  }
  return { originalUserMessage: last.originalUserMessage, choice };
}

/**
 * When the user mixes strong planning and research signals, ask once instead of guessing.
 */
export function getDisambiguationReply(userMessage: string): string | null {
  const t = userMessage.trim();
  if (t.length === 0 || isNotionIntentOverride(t)) {
    return null;
  }

  if (PLANNING_HINT.test(t) && RESEARCH_HINT.test(t)) {
    return (
      `That message mixes **planning** and **research** signals.\n\n` +
      `Reply with:\n` +
      `• **1** — Plan your week, priorities, or schedule\n` +
      `• **2** — Research, compare sources, or a deep dive\n\n` +
      `Or send a new message focused on just one of those.`
    );
  }

  if (/^(hi|hey|hello|help)\b[!.\s]*$/i.test(t)) {
    return (
      `Hi — I'm Magnus, your chief of staff.\n\n` +
      `Say what you're working on (planning, health, research, Notion, etc.) and I'll route you to the right specialist.`
    );
  }

  return null;
}
