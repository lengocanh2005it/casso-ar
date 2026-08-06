function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .trim();
}

function distance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length];
}

export function payerNameScore(
  counterpartyName: string,
  customerName: string,
): number {
  const left = normalize(counterpartyName);
  const right = normalize(customerName);
  if (!left || !right) return 0;
  const leftWords = new Set(left.split(/\s+/));
  const rightWords = right.split(/\s+/);
  const overlap =
    rightWords.filter((word) => leftWords.has(word)).length / rightWords.length;
  const maxLength = Math.max(left.length, right.length);
  const similarity = 1 - distance(left, right) / maxLength;
  return overlap >= 0.5 || similarity >= 0.6 ? 5 : 0;
}
