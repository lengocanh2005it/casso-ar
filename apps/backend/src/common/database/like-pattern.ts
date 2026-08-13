// Escapes LIKE/ILIKE metacharacters so a user search term matches literally.
// Postgres treats backslash as the default escape character, so `\%`, `\_`,
// and `\\` in a pattern match literal %, _, and \ respectively.
export function toLikePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
