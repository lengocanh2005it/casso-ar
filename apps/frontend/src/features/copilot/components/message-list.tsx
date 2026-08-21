import type { CopilotMessage } from '../types';
import { CopilotMessageBubble } from './copilot-message-bubble';
import { EmailDraftPreview } from './email-draft-preview';

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
        <div key={message.id} className="space-y-2">
          <CopilotMessageBubble message={message} />
          {message.drafts?.map((draft) => (
            <EmailDraftPreview
              key={draft.draftId}
              subject={draft.subject}
              recipientEmail={draft.recipientEmail}
              bodyHtml={draft.bodyHtml}
            />
          ))}
        </div>
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
