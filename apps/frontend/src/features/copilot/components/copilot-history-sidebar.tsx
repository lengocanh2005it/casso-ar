import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CopilotConversationSummary } from '../types';

export function CopilotHistorySidebar({
  conversations,
  activeConversationId,
  isLoading,
  onSelect,
  onNewChat,
}: {
  conversations: CopilotConversationSummary[];
  activeConversationId: string;
  isLoading: boolean;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-primary/15 bg-primary/5 px-3 py-3 dark:border-primary/25 dark:bg-primary/10">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
          Lịch sử chat
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onNewChat}
          aria-label="Cuộc trò chuyện mới"
        >
          <Plus className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading && conversations.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            Đang tải…
          </p>
        )}
        {!isLoading && conversations.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            Chưa có cuộc trò chuyện nào.
          </p>
        )}
        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            onClick={() => onSelect(conversation.id)}
            className={cn(
              'mb-1 block w-full truncate rounded-md px-2 py-2 text-left text-sm hover:bg-muted',
              conversation.id === activeConversationId &&
                'bg-muted font-medium',
            )}
          >
            {conversation.title}
          </button>
        ))}
      </div>
    </div>
  );
}
