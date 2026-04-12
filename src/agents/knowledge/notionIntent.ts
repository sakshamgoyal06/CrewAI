/**
 * Fast-path routing: strong Notion signals before/instead of LLM classification.
 * @see docs/AGENT_ROSTER.md §5.5
 */
export function isNotionIntentOverride(message: string): boolean {
  return /\b(?:log (?:this )?to notion|#\s*notion|notion:|create a task in goals|goals database|daily check[- ]?in|today'?s check[- ]?in|patterns? log|update my pattern|morning brief|weekly review|append to notion)\b/i.test(
    message,
  );
}
