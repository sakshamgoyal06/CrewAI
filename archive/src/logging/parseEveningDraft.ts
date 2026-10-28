/**
 * Deterministic field extraction from free-text evening journal replies.
 */
import type { EveningJournalDraft } from "./types.js";

const RATING_RE = /\b(?:day\s*)?rating[:\s]*(\d{1,2})(?:\s*\/\s*10)?\b/i;
const SLASH_RATING_RE = /\b(\d{1,2})\s*\/\s*10\b/;
const JOY_RE = /\bjoy(?:\s*score)?[:\s]*(\d{1,3})\b/i;
const STANDALONE_SCORE_RE = /^\s*(\d{1,2})\s*[.!]?\s*$/;

function clampRating(n: number): number | undefined {
  if (n >= 1 && n <= 10) {
    return n;
  }
  return undefined;
}

function clampJoy(n: number): number | undefined {
  if (n >= 1 && n <= 100) {
    return n;
  }
  return undefined;
}

export function mergeEveningDraft(
  existing: EveningJournalDraft,
  patch: EveningJournalDraft,
): EveningJournalDraft {
  return {
    day_rating: patch.day_rating ?? existing.day_rating,
    joy_score: patch.joy_score ?? existing.joy_score,
    feeling: patch.feeling ?? existing.feeling,
    notes: patch.notes ?? existing.notes,
  };
}

export function parseEveningDraftFromMessage(message: string): EveningJournalDraft {
  const text = message.trim();
  if (!text) {
    return {};
  }

  const draft: EveningJournalDraft = {};

  const ratingMatch = text.match(RATING_RE) ?? text.match(SLASH_RATING_RE);
  if (ratingMatch) {
    draft.day_rating = clampRating(Number.parseInt(ratingMatch[1], 10));
  } else {
    const standalone = text.match(STANDALONE_SCORE_RE);
    if (standalone) {
      draft.day_rating = clampRating(Number.parseInt(standalone[1], 10));
    }
  }

  const joyMatch = text.match(JOY_RE);
  if (joyMatch) {
    draft.joy_score = clampJoy(Number.parseInt(joyMatch[1], 10));
  }

  const feelingPrefix = text.match(
    /^(?:feeling[:\s]*)?(tired|exhausted|good|great|okay|ok|rough|productive|calm|anxious|happy|low|meh|fine|drained|energized|stressed|peaceful)\b/i,
  );
  if (feelingPrefix) {
    draft.feeling = feelingPrefix[1].toLowerCase();
  } else if (
    /\b(?:felt|feeling)\s+(.{3,80})/i.test(text) &&
    !draft.day_rating &&
    !draft.joy_score
  ) {
    const feltMatch = text.match(/\b(?:felt|feeling)\s+(.{3,120})/i);
    if (feltMatch) {
      draft.feeling = feltMatch[1].trim().replace(/[.!]+$/, "");
    }
  }

  const strippedForNotes = text
    .replace(RATING_RE, "")
    .replace(SLASH_RATING_RE, "")
    .replace(JOY_RE, "")
    .trim();

  if (strippedForNotes.length >= 12) {
    draft.notes = strippedForNotes;
  } else if (!draft.day_rating && !draft.joy_score && !draft.feeling && text.length >= 8) {
    draft.notes = text;
  }

  return draft;
}

export function eveningDraftIsSubstantive(draft: EveningJournalDraft): boolean {
  if (draft.day_rating != null || draft.joy_score != null) {
    return true;
  }
  if (draft.feeling && draft.feeling.length >= 3) {
    return true;
  }
  if (draft.notes && draft.notes.length >= 8) {
    return true;
  }
  return false;
}

export function formatEveningDraftSummary(draft: EveningJournalDraft): string {
  const lines: string[] = [];
  if (draft.day_rating != null) {
    lines.push(`Day rating: **${draft.day_rating}/10**`);
  }
  if (draft.joy_score != null) {
    lines.push(`Joy: **${draft.joy_score}/100**`);
  }
  if (draft.feeling) {
    lines.push(`Feeling: **${draft.feeling}**`);
  }
  if (draft.notes) {
    lines.push(`Notes: ${draft.notes}`);
  }
  return lines.join("\n");
}

export function missingEveningFields(draft: EveningJournalDraft): string[] {
  const missing: string[] = [];
  if (draft.day_rating == null && draft.joy_score == null) {
    missing.push("a day rating (1–10) or joy score (1–100)");
  }
  if (!draft.feeling && !draft.notes) {
    missing.push("how the day felt or a short reflection");
  }
  return missing;
}
