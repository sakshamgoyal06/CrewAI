/** Strip step-scaffolding from meal log text before persisting or displaying. */
export function sanitizeMealLogRawText(text: string): string {
  const trimmed = text.trim();
  const scaffoldIdx = trimmed.search(/\n\n---\n(?:Prior steps completed:|Step focus:)/);
  if (scaffoldIdx >= 0) {
    return trimmed.slice(0, scaffoldIdx).trim();
  }
  return trimmed;
}
