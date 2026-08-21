const VISIBLE_SUFFIX_LENGTH = 4;
const MASK = '••••';

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= VISIBLE_SUFFIX_LENGTH) return MASK;
  return MASK + apiKey.slice(-VISIBLE_SUFFIX_LENGTH);
}
