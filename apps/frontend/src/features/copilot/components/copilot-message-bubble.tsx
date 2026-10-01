import {
  COPILOT_RECEIVABLE_FIELD_ALIASES,
  type CopilotReceivableField,
} from '@casso-ar/shared-types';
import { Bot, StopCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CopilotMessage } from '../types';
import { HIGHLIGHT_CLASS, renderHighlighted } from './copilot-highlight';
import {
  CopilotReceivableList,
  type CopilotReceivableRow,
} from './copilot-receivable-list';

function renderAssistantContent(content: string) {
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of content.matchAll(/\*\*([\s\S]+?)\*\*/g)) {
    const start = match.index ?? cursor;
    parts.push(...renderHighlighted(content.slice(cursor, start), `t${start}`));
    parts.push(
      <strong key={`b${start}`} className={HIGHLIGHT_CLASS}>
        {match[1]}
      </strong>,
    );
    cursor = start + match[0].length;
  }

  parts.push(...renderHighlighted(content.slice(cursor), `t${cursor}`));
  return parts;
}

/**
 * The model writes each receivable as "<name> - Số hóa đơn: X - Số tiền còn
 * lại: N - Hạn thanh toán: D", but it varies both the wording ("Ngày đáo hạn"
 * for "Hạn thanh toán") and whether the fields share one line or spill onto
 * their own lines. So locate the labels instead of matching one rigid shape:
 * whatever sits before the first label is the customer name, and each value
 * runs up to the next label. A block only becomes a row once it carries an
 * amount; everything else stays prose.
 */
const LIST_ITEM_RE = /^\s*(?:\d+|[A-Za-z])[.)]\s*(.+)$/;
const SURROUNDING_NOISE = /^[\s\-–—:|*]+|[\s\-–—:|*]+$/gu;

interface FieldMatch {
  field: CopilotReceivableField;
  start: number;
  valueStart: number;
}

/**
 * A bullet or a stray Markdown star must not leak into the customer name, and
 * a list position must never be glued onto it either.
 */
const LEADING_MARKER = /^(?:\s*(?:\d+|[A-Za-z])[.)]\s*|\s*[-–—•*]\s*)+/;

function locateFields(text: string): FieldMatch[] {
  const lower = text.toLowerCase();
  const earliest = new Map<CopilotReceivableField, FieldMatch>();

  for (const [field, labels] of Object.entries(
    COPILOT_RECEIVABLE_FIELD_ALIASES,
  ) as [CopilotReceivableField, readonly string[]][]) {
    for (const label of labels) {
      const start = lower.indexOf(label.toLowerCase());
      if (start < 0) continue;
      const seen = earliest.get(field);
      if (seen && seen.start <= start) continue;
      earliest.set(field, { field, start, valueStart: start + label.length });
    }
  }

  return [...earliest.values()].sort((a, b) => a.start - b.start);
}

function trimSeparators(value: string): string {
  return value.replaceAll('**', '').replace(SURROUNDING_NOISE, '').trim();
}

function cleanCustomerName(value: string): string {
  return value
    .replaceAll('**', '')
    .replace(LEADING_MARKER, '')
    .replace(SURROUNDING_NOISE, '')
    .trim();
}

function buildReceivableRow(text: string): CopilotReceivableRow | null {
  const fields = locateFields(text);
  if (fields.length === 0) return null;

  const values = new Map<CopilotReceivableField, string>();
  fields.forEach((field, index) => {
    const end = fields[index + 1]?.start ?? text.length;
    values.set(field.field, trimSeparators(text.slice(field.valueStart, end)));
  });

  const customerName = cleanCustomerName(text.slice(0, fields[0].start));
  const amountValue = values.get('amount') ?? '';
  const remainingAmount = /\d[\d.,]*(?:\s\d{3})*/
    .exec(amountValue)?.[0]
    .replace(/[.,]$/, '');
  if (!customerName || !remainingAmount) return null;

  const invoice = trimSeparators(values.get('invoice') ?? '');
  const dueDate = trimSeparators(values.get('due') ?? '');

  return {
    customerName,
    invoiceNumber:
      !invoice || invoice.toLowerCase().startsWith('chưa có') ? null : invoice,
    remainingAmount,
    dueDate: /[\d/-]+/.test(dueDate)
      ? (/[\d/.-]+/.exec(dueDate)?.[0] ?? '')
      : '',
  };
}

function isContinuationLine(line: string): boolean {
  const [first] = locateFields(line);
  if (!first) return false;
  return line.slice(0, first.start).replace(LEADING_MARKER, '').trim() === '';
}

/**
 * A receivable block opens on a list marker, or on any line that already
 * carries the fields. buildReceivableRow is the real gate, so ordinary
 * numbered prose ("1. Bước đầu tiên…") still falls back to a paragraph.
 */
function looksLikeRowStart(line: string): boolean {
  return LIST_ITEM_RE.test(line) || locateFields(line).length > 0;
}

interface Segment {
  kind: 'text' | 'receivables';
  content: string;
  rows?: CopilotReceivableRow[];
}

function splitIntoSegments(content: string): Segment[] {
  const segments: Segment[] = [];
  let buffer: string[] = [];
  let pending: { source: string; parts: string[] } | null = null;

  const flush = () => {
    const text = buffer.join('\n');
    if (text.trim()) segments.push({ kind: 'text', content: text });
    buffer = [];
  };

  const emitRow = (candidate: { source: string; text: string }) => {
    const row = buildReceivableRow(candidate.text);
    if (!row) {
      buffer.push(candidate.source);
      return;
    }
    flush();
    const last = segments.at(-1);
    if (last?.kind === 'receivables' && last.rows) last.rows.push(row);
    else segments.push({ kind: 'receivables', content: '', rows: [row] });
  };

  const closePending = () => {
    if (!pending) return;
    emitRow({ source: pending.source, text: pending.parts.join(' ') });
    pending = null;
  };

  for (const line of content.split('\n')) {
    if (pending && isContinuationLine(line)) {
      pending.parts.push(line.trim());
      continue;
    }

    const listMatch = LIST_ITEM_RE.exec(line);
    if (listMatch) {
      closePending();
      pending = { source: line, parts: [listMatch[1].trim()] };
    } else if (looksLikeRowStart(line)) {
      closePending();
      pending = { source: line, parts: [line.trim()] };
    } else {
      closePending();
      buffer.push(line);
    }
  }

  closePending();
  flush();

  return segments;
}

function renderSegments(content: string): ReactNode[] {
  return splitIntoSegments(content).map((segment) =>
    segment.kind === 'receivables' && segment.rows ? (
      <CopilotReceivableList
        key={`rows-${segment.rows.map((row) => row.customerName).join('|')}`}
        rows={segment.rows}
      />
    ) : (
      <p
        key={`text-${segment.content.slice(0, 32)}`}
        className="break-words whitespace-pre-wrap text-sm leading-6"
      >
        {renderAssistantContent(segment.content)}
      </p>
    ),
  );
}

export function CopilotMessageBubble({
  message,
  isStreaming = false,
  isWaitingForResponse = false,
}: {
  message: Pick<CopilotMessage, 'role' | 'content' | 'isPartial'>;
  isStreaming?: boolean;
  isWaitingForResponse?: boolean;
}) {
  if (message.role === 'USER') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[80%] break-words rounded-lg rounded-tr-none bg-primary px-3 py-2 text-sm text-primary-foreground">
          {message.content}
        </p>
      </div>
    );
  }

  if (
    !message.content &&
    !isStreaming &&
    !message.isPartial &&
    !isWaitingForResponse
  ) {
    return null;
  }

  return (
    <div className="flex min-w-0 items-start gap-2">
      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Bot className="size-3.5" aria-hidden="true" />
      </div>
      <div className="min-w-0 max-w-[90%]">
        {isWaitingForResponse ? (
          <p className="break-words whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm leading-6">
            <span
              aria-hidden="true"
              className="flex h-5 items-center gap-1 px-0.5"
            >
              <span className="size-2 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.3s] motion-reduce:animate-none" />
              <span className="size-2 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.15s] motion-reduce:animate-none" />
              <span className="size-2 animate-bounce rounded-full bg-primary/70 motion-reduce:animate-none" />
            </span>
          </p>
        ) : (
          <div className="rounded-lg bg-muted px-3 py-2">
            {isStreaming ? (
              <p className="break-words whitespace-pre-wrap text-sm leading-6">
                {renderAssistantContent(message.content)}
                <span
                  aria-hidden="true"
                  className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-foreground/70 align-middle"
                />
              </p>
            ) : (
              renderSegments(message.content)
            )}
          </div>
        )}
        {message.isPartial && (
          <span className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <StopCircle className="size-3" aria-hidden="true" />
            Đã dừng
          </span>
        )}
      </div>
    </div>
  );
}
