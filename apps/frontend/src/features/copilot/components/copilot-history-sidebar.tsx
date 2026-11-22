import { MessageSquare, Plus, X } from 'lucide-react';
import { TooltipLabel } from '@/components/shared/tooltip-label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CopilotConversationSummary } from '../types';

const UNTITLED_CONVERSATION_LABEL = 'Cuộc trò chuyện không tên';

export function CopilotHistorySidebar({
  conversations,
  activeConversationId,
  isLoading,
  onSelect,
  onNewChat,
  onClose,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}: {
  conversations: CopilotConversationSummary[];
  activeConversationId: string;
  isLoading: boolean;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onClose?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border bg-muted/20 px-3 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
          Lịch sử chat
        </span>
        <div className="flex items-center gap-1">
          <TooltipLabel label="Cuộc trò chuyện mới">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onNewChat}
              aria-label="Cuộc trò chuyện mới"
            >
              <Plus aria-hidden="true" className="size-4" />
            </Button>
          </TooltipLabel>
          {onClose && (
            <TooltipLabel label="Đóng lịch sử chat">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Đóng lịch sử chat"
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </TooltipLabel>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {isLoading && conversations.length === 0 && (
          <p
            role="status"
            className="px-2 py-4 text-center text-xs text-muted-foreground"
          >
            Đang tải…
          </p>
        )}
        {!isLoading && conversations.length === 0 && (
          <div className="flex h-full items-center justify-center px-4 text-center">
            <div>
              <div className="mx-auto mb-3 flex size-9 items-center justify-center rounded-xl bg-muted text-primary">
                <MessageSquare aria-hidden="true" className="size-4" />
              </div>
              <p className="text-sm font-medium text-foreground">
                Chưa có cuộc trò chuyện
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Đặt câu hỏi đầu tiên để bắt đầu.
              </p>
            </div>
          </div>
        )}
        {conversations.map((conversation) => {
          const title = conversation.title || UNTITLED_CONVERSATION_LABEL;
          const isActive = conversation.id === activeConversationId;
          return (
            <TooltipLabel key={conversation.id} label={title}>
              <button
                type="button"
                onClick={() => onSelect(conversation.id)}
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                  'block w-full truncate rounded-md border border-transparent px-2.5 py-2.5 text-left text-sm text-foreground/90 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive &&
                    'border-border bg-muted font-medium text-foreground',
                )}
              >
                {title}
              </button>
            </TooltipLabel>
          );
        })}
        {hasMore && onLoadMore && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            disabled={isLoadingMore}
            onClick={onLoadMore}
          >
            Xem thêm
          </Button>
        )}
      </div>
    </div>
  );
}
