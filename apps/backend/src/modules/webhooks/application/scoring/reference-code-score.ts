function normalize(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= '0' && character <= '9';
}

// Separators are stripped by normalize(), so a shorter code (INV-1) would
// otherwise match inside a longer one (INV-10). A match is not the complete
// code when a digit continues the number on a side where the code itself
// ends in a digit. Letters may touch: bank content is often written glued.
function containsCompleteCode(content: string, code: string): boolean {
  const startsWithDigit = isDigit(code[0]);
  const endsWithDigit = isDigit(code[code.length - 1]);
  for (
    let at = content.indexOf(code);
    at !== -1;
    at = content.indexOf(code, at + 1)
  ) {
    if (startsWithDigit && isDigit(content[at - 1])) continue;
    if (endsWithDigit && isDigit(content[at + code.length])) continue;
    return true;
  }
  return false;
}

// ponytail: character-overlap heuristic; replace with edit-distance scoring if false positives appear.
export function referenceCodeScore(
  transferContent: string,
  invoiceNumber: string,
): number {
  const content = normalize(transferContent);
  const code = normalize(invoiceNumber);
  if (code.length === 0) return 0;
  if (containsCompleteCode(content, code)) return 60;
  const matchingCharacters = code
    .split('')
    .filter((character) => content.includes(character));
  return matchingCharacters.length / code.length >= 0.7 ? 30 : 0;
}
