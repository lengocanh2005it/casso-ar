function normalize(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// ponytail: character-overlap heuristic; replace with edit-distance scoring if false positives appear.
export function referenceCodeScore(
  transferContent: string,
  invoiceNumber: string,
): number {
  const content = normalize(transferContent);
  const code = normalize(invoiceNumber);
  if (code.length === 0) return 0;
  if (content.includes(code)) return 60;
  const matchingCharacters = code
    .split('')
    .filter((character) => content.includes(character));
  return matchingCharacters.length / code.length >= 0.7 ? 30 : 0;
}
