import type { CopilotMessage } from '../types';

export function MessageList({ messages }: { messages: CopilotMessage[] }) {
  if (messages.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Hỏi Copilot về công nợ và lịch sử thanh toán…
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <div
          key={message.id}
          className={
            message.role === 'USER' ? 'flex justify-end' : 'flex justify-start'
          }
        >
          <p
            className={
              message.role === 'USER'
                ? 'max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground'
                : 'max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm'
            }
          >
            {message.content}
          </p>
        </div>
      ))}
    </div>
  );
}
