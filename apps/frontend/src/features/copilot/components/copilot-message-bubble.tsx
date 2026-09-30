import { Bot, StopCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CopilotMessage } from '../types';

function renderAssistantContent(content: string) {
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of content.matchAll(/\*\*([\s\S]+?)\*\*/g)) {
    const start = match.index ?? cursor;
    parts.push(content.slice(cursor, start));
    parts.push(<strong key={start}>{match[1]}</strong>);
    cursor = start + match[0].length;
  }

  parts.push(content.slice(cursor));
  return parts;
}

export function CopilotMessageBubble({
  message,
  isStreaming = false,
}: {
  message: Pick<CopilotMessage, 'role' | 'content' | 'isPartial'>;
  isStreaming?: boolean;
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

  if (!message.content && !isStreaming && !message.isPartial) return null;

  return (
    <div className="flex min-w-0 items-start gap-2">
      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Bot className="size-3.5" aria-hidden="true" />
      </div>
      <div className="min-w-0 max-w-[80%]">
        <p className="break-words whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm">
          {renderAssistantContent(message.content)}
          {isStreaming && (
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
