function normalize(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= '0' && character <= '9';
}

interface CompactContent {
  text: string;
  // gapBefore[i]: a separator sat between text[i - 1] and text[i] in the raw
  // content, so "INV-1 2026" is not mistaken for the single number "INV12026".
  gapBefore: boolean[];
}

function compact(value: string): CompactContent {
  let text = '';
  const gapBefore: boolean[] = [];
  let gap = false;
  for (const character of value.toUpperCase()) {
    if (/[A-Z0-9]/.test(character)) {
      text += character;
      gapBefore.push(gap);
      gap = false;
    } else {
      gap = true;
    }
  }
  return { text, gapBefore };
}

// Separators are stripped when comparing, so a shorter code (INV-1) would
// otherwise match inside a longer one (INV-10). A match is not the complete
// code when a digit continues the number, with no separator in between, on a
// side where the code itself ends in a digit. Letters may touch: bank content
// is often written glued.
function containsCompleteCode(content: CompactContent, code: string): boolean {
  const { text, gapBefore } = content;
  const startsWithDigit = isDigit(code[0]);
  const endsWithDigit = isDigit(code[code.length - 1]);
  for (
    let at = text.indexOf(code);
    at !== -1;
    at = text.indexOf(code, at + 1)
  ) {
    const next = at + code.length;
    if (startsWithDigit && isDigit(text[at - 1]) && !gapBefore[at]) continue;
    if (endsWithDigit && isDigit(text[next]) && !gapBefore[next]) continue;
    return true;
  }
  return false;
}

// ponytail: character-overlap heuristic; replace with edit-distance scoring if false positives appear.
export function referenceCodeScore(
  transferContent: string,
  invoiceNumber: string,
): number {
  const content = compact(transferContent);
  const code = normalize(invoiceNumber);
  if (code.length === 0) return 0;
  if (containsCompleteCode(content, code)) return 60;
  const matchingCharacters = code
    .split('')
    .filter((character) => content.text.includes(character));
  return matchingCharacters.length / code.length >= 0.7 ? 30 : 0;
}
