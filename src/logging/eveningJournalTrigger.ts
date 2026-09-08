/**
 * Detect user-initiated evening journal / check-in turns.
 */
const EVENING_TRIGGER_RE =
  /\b(?:evening\s+(?:check[- ]?in|journal|review|log)|log\s+(?:my\s+)?evening|end\s+of\s+day\s+(?:check[- ]?in|journal|log)|eod\s+(?:check[- ]?in|journal|log))\b/i;

export function isEveningJournalTrigger(message: string): boolean {
  return EVENING_TRIGGER_RE.test(message.trim());
}
