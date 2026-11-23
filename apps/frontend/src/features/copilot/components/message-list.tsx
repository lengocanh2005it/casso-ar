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
      {/* The single live region for the chat: aria-busy stops partial
          streaming text from being announced token by token. The waiting
          status lives in the page: this list only mounts once a question
          exists, so a status here would arrive with its text already inside. */}
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
