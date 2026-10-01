import type { ReactNode } from 'react';

export const HIGHLIGHT_CLASS =
  'rounded bg-primary/15 px-1 py-0.5 font-semibold text-primary ring-1 ring-primary/25';

/**
 * VND amounts and dd/mm/yyyy dates are what a collections user scans for, so we
 * highlight them in the UI rather than trusting the model to mark every value.
 */
const HIGHLIGHT_PATTERN =
  /((?:Công ty|Hợp tác xã|Doanh nghiệp)[^:\n]{2,100}(?=:)|\d{1,2}\/\d{1,2}\/\d{4}|\d[\d.,]*(?:\s(?:VNĐ|đ|VND))?)/g;

const CURRENCY_SUFFIX = /(?:\s(?:VNĐ|đ|VND))$/i;

function isHighlightable(token: string): boolean {
  if (/^(?:Công ty|Hợp tác xã|Doanh nghiệp)/.test(token)) return true;
  if (/\//.test(token)) return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(token);
  return CURRENCY_SUFFIX.test(token) || /\d{1,3}(?:[.,]\d{3})+/.test(token);
}

export function renderHighlighted(
  text: string,
  keyPrefix: string,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let index = 0;

  for (const match of text.matchAll(HIGHLIGHT_PATTERN)) {
    const token = match[0];
    if (!isHighlightable(token)) continue;
    const start = match.index ?? cursor;
    if (start > cursor) nodes.push(text.slice(cursor, start));
    nodes.push(
      <mark
        key={`${keyPrefix}-${start}-${index++}`}
        className={HIGHLIGHT_CLASS}
      >
        {token}
      </mark>,
    );
    cursor = start + token.length;
  }

  nodes.push(text.slice(cursor));
  return nodes;
}
