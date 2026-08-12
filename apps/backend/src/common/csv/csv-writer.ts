const FORMULA_PREFIXES = ['=', '+', '-', '@'];

export function csvEscape(value: string): string {
  const first = value.charAt(0);
  const needsFormulaGuard = FORMULA_PREFIXES.includes(first);
  const escaped = needsFormulaGuard ? `'${value}` : value;
  if (/[",\r\n]/.test(escaped)) {
    return `"${escaped.replaceAll('"', '""')}"`;
  }
  return escaped;
}

export function toCsv(header: string[], rows: string[][]): string {
  const lines = [header, ...rows].map((row) =>
    row.map((cell) => csvEscape(cell)).join(','),
  );
  return lines.join('\r\n');
}
