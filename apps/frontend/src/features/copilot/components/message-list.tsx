import type { CopilotMessage } from '../types';
import { CopilotMessageBubble } from './copilot-message-bubble';

export function MessageList({
  messages,
  streamingContent,
}: {
  messages: CopilotMessage[];
  streamingContent?: string;
}) {
  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <CopilotMessageBubble key={message.id} message={message} />
      ))}
      {streamingContent && (
        <CopilotMessageBubble
          message={{ role: 'ASSISTANT', content: streamingContent }}
          isStreaming
        />
      )}
    </div>
  );
}
