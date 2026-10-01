import { Bot, StopCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CopilotMessage } from '../types';

const HIGHLIGHT_CLASS =
  'rounded bg-primary/10 px-0.5 font-medium text-foreground ring-1 ring-primary/20';

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
        <p className="break-words whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm leading-6">
          {isWaitingForResponse ? (
            <span
              aria-hidden="true"
              className="flex h-5 items-center gap-1 px-0.5"
            >
              <span className="size-2 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.3s] motion-reduce:animate-none" />
              <span className="size-2 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.15s] motion-reduce:animate-none" />
              <span className="size-2 animate-bounce rounded-full bg-primary/70 motion-reduce:animate-none" />
            </span>
          ) : (
            renderAssistantContent(message.content)
          )}
          {isStreaming && !isWaitingForResponse && (
            <span
              aria-hidden="true"
              className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-foreground/70 align-middle"
            />
          )}
        </p>
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
