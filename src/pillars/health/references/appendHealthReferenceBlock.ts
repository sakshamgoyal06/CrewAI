export function appendHealthReferenceBlock(base: string, healthReferenceBlock?: string): string {
  if (!healthReferenceBlock?.trim()) {
    return base;
  }
  return `${base}${healthReferenceBlock}`;
}
