import { Permission, PlanId } from '@casso-ledger/shared-types';
import {
  Lock,
  Mail,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Square,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useAuth } from '@/contexts/auth-context';
import { hasPlanAccess } from '@/lib/plan-access';
import { hasPermission } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import { useCopilotChat } from '../api/use-copilot';
import { useCopilotConversations } from '../api/use-copilot-conversations';
import { CopilotHistorySidebar } from '../components/copilot-history-sidebar';
import { CopilotWelcomeState } from '../components/copilot-welcome-state';
import { DraftsList } from '../components/drafts-list';
import { MessageList } from '../components/message-list';
import { PendingActionCard } from '../components/pending-action-card';
import { UsageIndicator } from '../components/usage-indicator';

export function CopilotPage() {
  const { user } = useAuth();
  const [draft, setDraft] = useState('');
  const [historySheetOpen, setHistorySheetOpen] = useState(false);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [draftsSheetOpen, setDraftsSheetOpen] = useState(false);
  const [draftsCollapsed, setDraftsCollapsed] = useState(false);
  const canSendManual = user
    ? hasPermission(user.role, Permission.REMINDER_SEND_MANUAL)
    : false;

  const {
    conversations,
    activeConversationId,
    isLoading: isLoadingConversations,
    refresh: refreshConversations,
    startNewConversation,
    selectConversation,
  } = useCopilotConversations();

  const {
    messages,
    pendingAction,
    isSending,
    streamingContent,
    send,
    stop,
    confirm,
    cancel,
    busy,
    blockedByPendingAction,
  } = useCopilotChat(canSendManual, activeConversationId, {
    onTurnComplete: refreshConversations,
  });

  if (!user || !hasPlanAccess(user.subscriptionPlan, PlanId.STARTER)) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 p-6">
        <Lock aria-hidden="true" className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Copilot yêu cầu gói Starter hoặc cao hơn.
        </p>
      </div>
    );
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isSending || blockedByPendingAction) return;
    setDraft('');
    void send(content);
  }

  const isEmptyConversation = messages.length === 0 && !streamingContent;
  const historySidebar = (
    <CopilotHistorySidebar
      conversations={conversations}
      activeConversationId={activeConversationId}
      isLoading={isLoadingConversations}
      onSelect={(id) => {
        selectConversation(id);
        setHistorySheetOpen(false);
      }}
      onNewChat={() => {
        startNewConversation();
        setHistorySheetOpen(false);
      }}
    />
  );
  const draftsPanel = (
    <div className="flex h-full flex-col">
      <div className="border-b px-3 py-2.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Bản nháp email
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <DraftsList canSendManual={canSendManual} />
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold sm:text-2xl">Copilot</h1>
        <UsageIndicator />
      </div>
      <div className="flex min-h-0 flex-1 gap-3">
        <aside
          className={cn(
            'hidden shrink-0 overflow-hidden rounded-lg border transition-[width] duration-200 md:block',
            historyCollapsed ? 'w-0 border-0' : 'w-56',
          )}
        >
          <div className={cn('h-full w-56', historyCollapsed && 'invisible')}>
            {historySidebar}
          </div>
        </aside>
        <Sheet open={historySheetOpen} onOpenChange={setHistorySheetOpen}>
          <SheetContent side="left" className="w-64 p-0">
            {historySidebar}
          </SheetContent>
        </Sheet>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="md:hidden"
                onClick={() => setHistorySheetOpen(true)}
                aria-label="Mở lịch sử chat"
              >
                <Menu className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="hidden md:inline-flex"
                onClick={() => setHistoryCollapsed((current) => !current)}
                aria-label={
                  historyCollapsed ? 'Mở lịch sử chat' : 'Thu gọn lịch sử chat'
                }
              >
                {historyCollapsed ? (
                  <PanelLeftOpen className="size-4" />
                ) : (
                  <PanelLeftClose className="size-4" />
                )}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="md:hidden"
                onClick={() => setDraftsSheetOpen(true)}
                aria-label="Mở bản nháp email"
              >
                <Mail className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="hidden md:inline-flex"
                onClick={() => setDraftsCollapsed((current) => !current)}
                aria-label={
                  draftsCollapsed
                    ? 'Mở bản nháp email'
                    : 'Thu gọn bản nháp email'
                }
              >
                {draftsCollapsed ? (
                  <PanelRightOpen className="size-4" />
                ) : (
                  <PanelRightClose className="size-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col space-y-3 overflow-y-auto rounded-lg border p-4">
            {isEmptyConversation ? (
              <CopilotWelcomeState
                onSuggestionClick={(text) => void send(text)}
              />
            ) : (
              <MessageList
                messages={messages}
                streamingContent={streamingContent}
              />
            )}
            {pendingAction && canSendManual && (
              <PendingActionCard
                action={pendingAction}
                busy={busy}
                onConfirm={() => void confirm()}
                onCancel={() => void cancel()}
              />
            )}
          </div>
          <form onSubmit={onSubmit} className="mt-3 flex gap-2">
            <Input
              name="question"
              autoComplete="off"
              aria-label="Enter question"
              placeholder="Hỏi về công nợ…"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={isSending || blockedByPendingAction}
            />
            {isSending ? (
              <Button
                type="button"
                variant="outline"
                onClick={stop}
                aria-label="Dừng"
              >
                <Square className="size-4" />
                Dừng
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={blockedByPendingAction || !draft.trim()}
              >
                Send
              </Button>
            )}
          </form>
        </div>

        <aside
          className={cn(
            'hidden shrink-0 overflow-hidden rounded-lg border transition-[width] duration-200 md:block',
            draftsCollapsed ? 'w-0 border-0' : 'w-80',
          )}
        >
          <div className={cn('h-full w-80', draftsCollapsed && 'invisible')}>
            {draftsPanel}
          </div>
        </aside>
        <Sheet open={draftsSheetOpen} onOpenChange={setDraftsSheetOpen}>
          <SheetContent side="right" className="w-80 p-0">
            {draftsPanel}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
