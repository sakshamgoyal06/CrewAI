/**
 * Sub-route on GENERAL: user wants research-style synthesis (and/or pasted URLs).
 */
export function isResearchSubIntent(message: string): boolean {
  if (/\bhttps?:\/\//i.test(message)) {
    return true;
  }
  const lower = message.toLowerCase();
  const patterns = [
    /\bresearch\b/,
    /\bcompare\b/,
    /\bversus\b|\bvs\.?\b/,
    /\bsummar(y|ise|ize)\b/,
    /\bdeep dive\b/,
    /\bcompetitive\b/,
    /\bliterature\b/,
    /\bpapers?\b/,
    /\bcitations?\b|\bcite\b/,
    /\bsources?\b/,
  ];
  return patterns.some((p) => p.test(lower));
}

export function wantsResearchDepth(message: string): boolean {
  return /\b(in depth|deep dive|full report|comprehensive|detailed|long form|exhaustive)\b/i.test(
    message,
  );
}
