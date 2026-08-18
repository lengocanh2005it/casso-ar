import { Bot } from 'lucide-react';
import type { CopilotMessage } from '../types';

export function CopilotMessageBubble({
  message,
  isStreaming = false,
}: {
  message: Pick<CopilotMessage, 'role' | 'content'>;
  isStreaming?: boolean;
}) {
  if (message.role === 'USER') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[80%] rounded-lg rounded-tr-none bg-primary px-3 py-2 text-sm text-primary-foreground">
          {message.content}
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Bot className="size-3.5" aria-hidden="true" />
      </div>
      <p className="max-w-[80%] whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm">
        {message.content}
        {isStreaming && (
          <span
            aria-hidden="true"
            className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-foreground/70 align-middle"
          />
        )}
      </p>
    </div>
  );
}
