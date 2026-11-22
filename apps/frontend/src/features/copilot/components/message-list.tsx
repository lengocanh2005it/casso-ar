import type { CopilotMessage } from '../types';
import { CopilotMessageBubble } from './copilot-message-bubble';
import { EmailDraftPreview } from './email-draft-preview';

export function MessageList({
  messages,
  streamingContent,
  isWaitingForResponse = false,
  isSending = false,
}: {
  messages: CopilotMessage[];
  streamingContent?: string;
  isWaitingForResponse?: boolean;
  isSending?: boolean;
}) {
  return (
    // The single live region for the chat: aria-busy stops partial streaming
    // text from being announced token by token, and the typing indicator below
    // stays a plain labelled element so nothing is announced twice.
    <div
      aria-busy={isSending}
      aria-label="Cuộc trò chuyện Copilot"
      aria-live="polite"
      className="space-y-3"
      role="log"
    >
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
      {isWaitingForResponse && !streamingContent && (
        <div aria-label="Copilot đang trả lời" role="img">
          <CopilotMessageBubble
            message={{ role: 'ASSISTANT', content: '' }}
            isWaitingForResponse
          />
        </div>
      )}
      {streamingContent && (
        <CopilotMessageBubble
          message={{ role: 'ASSISTANT', content: streamingContent }}
          isStreaming
        />
      )}
    </div>
  );
}
