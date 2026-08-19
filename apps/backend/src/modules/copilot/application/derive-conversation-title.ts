const MAX_TITLE_LENGTH = 40;

export function deriveConversationTitle(userMessage: string): string {
  const trimmed = userMessage.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= MAX_TITLE_LENGTH) return trimmed;

  const truncated = trimmed.slice(0, MAX_TITLE_LENGTH);
  const lastSpace = truncated.lastIndexOf(' ');
  const boundary = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
  return `${boundary}…`;
}
