export const REFERENCE_KEY_MIN_LENGTH = 4;
export const REFERENCE_KEY_MAX_LENGTH = 32;
// ponytail: only the first 200 normalized characters are read, which caps the
// key set (~5000 worst case). Raise it, or tokenize, if longer transfer
// descriptions need to be searched.
const MAX_CONTENT_LENGTH = 200;

// Every substring of the normalized content that could be a normalized invoice
// number. Normalization (ASCII letters/digits only, upper case) mirrors the
// expression index on invoices.invoiceNumber, so the keys can be looked up with
// `= ANY(keys)`. Candidates are filtered again with referenceCodeScore.
export function referenceKeysFromContent(transferContent: string): string[] {
  const text = transferContent
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, MAX_CONTENT_LENGTH);
  const keys = new Set<string>();
  for (
    let start = 0;
    start + REFERENCE_KEY_MIN_LENGTH <= text.length;
    start++
  ) {
    const longest = Math.min(REFERENCE_KEY_MAX_LENGTH, text.length - start);
    for (let length = REFERENCE_KEY_MIN_LENGTH; length <= longest; length++) {
      keys.add(text.slice(start, start + length));
    }
  }
  return [...keys];
}
