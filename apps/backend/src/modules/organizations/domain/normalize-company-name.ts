export function normalizeCompanyName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesTaxCodeName(entered: string, lookedUp: string): boolean {
  return normalizeCompanyName(entered) === normalizeCompanyName(lookedUp);
}
