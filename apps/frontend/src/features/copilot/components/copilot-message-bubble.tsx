import { Bot, StopCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CopilotMessage } from '../types';
import {
  CopilotReceivableList,
  type CopilotReceivableRow,
} from './copilot-receivable-list';

const HIGHLIGHT_CLASS =
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

function renderHighlighted(text: string, keyPrefix: string): ReactNode[] {
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
 * amount; everything else stays prose. ponytail: the labels are duplicated
 * between prompt and parser — have the tool return structured rows if the
 * model keeps drifting.
 */
const LIST_ITEM_RE = /^\s*\d+\.\s*(.+)$/;
const SURROUNDING_NOISE = /^[\s\-–—:|*]+|[\s\-–—:|*]+$/gu;

const LABELS = {
  invoice: ['số hoá đơn:', 'số hóa đơn:'],
  amount: ['số tiền còn lại:', 'số tiền:'],
  due: ['hạn thanh toán:', 'ngày đáo hạn:'],
} as const;

type Field = keyof typeof LABELS;

interface FieldMatch {
  field: Field;
  start: number;
  valueStart: number;
}

function locateFields(text: string): FieldMatch[] {
  const lower = text.toLowerCase();
  const earliest = new Map<Field, FieldMatch>();

  for (const field of Object.keys(LABELS) as Field[]) {
    for (const label of LABELS[field]) {
      const start = lower.indexOf(label);
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

function buildReceivableRow(text: string): CopilotReceivableRow | null {
  const fields = locateFields(text);
  if (fields.length === 0) return null;

  const values = new Map<Field, string>();
  fields.forEach((field, index) => {
    const end = fields[index + 1]?.start ?? text.length;
    values.set(field.field, trimSeparators(text.slice(field.valueStart, end)));
  });

  const customerName = trimSeparators(text.slice(0, fields[0].start));
  const remainingAmount = /\d[\d.,]*/.exec(values.get('amount') ?? '')?.[0];
  if (!customerName || !remainingAmount) return null;

  const invoice = values.get('invoice') ?? '';
  const dueDate = values.get('due') ?? '';

  return {
    customerName,
    invoiceNumber:
      !invoice || invoice.toLowerCase().startsWith('chưa có') ? null : invoice,
    remainingAmount: remainingAmount.replace(/\.$/, ''),
    dueDate: /[\d/-]+/.test(dueDate)
      ? (/[\d/.-]+/.exec(dueDate)?.[0] ?? '')
      : '',
  };
}

function isContinuationLine(line: string): boolean {
  const [first] = locateFields(line);
  if (!first) return false;
  return line.slice(0, first.start).replace(SURROUNDING_NOISE, '') === '';
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
