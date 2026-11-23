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
    <>
      {/* The wait lives outside the log: aria-busy defers the log's own
          announcements, so a status inside it would stay silent until the
          first delta landed. The dots stay decorative and this carries the
          words. */}
      <span className="sr-only" role="status">
        {isWaitingForResponse && !streamingContent
          ? 'Copilot đang trả lời…'
          : ''}
      </span>
      {/* The single live region for the chat: aria-busy stops partial
          streaming text from being announced token by token. */}
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
          <CopilotMessageBubble
            message={{ role: 'ASSISTANT', content: '' }}
            isWaitingForResponse
          />
        )}
        {streamingContent && (
          <CopilotMessageBubble
            message={{ role: 'ASSISTANT', content: streamingContent }}
            isStreaming
          />
        )}
      </div>
    </>
  );
}
