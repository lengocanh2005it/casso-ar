import { Permission, PlanId } from '@casso-ledger/shared-types';
import {
  Lock,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Square,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [draft, setDraft] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const activeTab = searchParams.get('tab') === 'drafts' ? 'drafts' : 'chat';
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
  const sidebar = (
    <CopilotHistorySidebar
      conversations={conversations}
      activeConversationId={activeConversationId}
      isLoading={isLoadingConversations}
      onSelect={(id) => {
        selectConversation(id);
        setSidebarOpen(false);
      }}
      onNewChat={() => {
        startNewConversation();
        setSidebarOpen(false);
      }}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold sm:text-2xl">Copilot</h1>
        <UsageIndicator />
      </div>
      <Tabs
        value={activeTab}
        onValueChange={(value) => setSearchParams({ tab: value })}
        className="min-h-0 flex-1"
      >
        <TabsList>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="drafts">Drafts</TabsTrigger>
        </TabsList>
        <TabsContent value="chat" className="flex min-h-0 flex-1 gap-3">
          <aside
            className={cn(
              'hidden shrink-0 overflow-hidden rounded-lg border transition-[width] duration-200 md:block',
              historyCollapsed ? 'w-0 border-0' : 'w-56',
            )}
          >
            <div className={cn('h-full w-56', historyCollapsed && 'invisible')}>
              {sidebar}
            </div>
          </aside>
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent side="left" className="w-64 p-0">
              {sidebar}
            </SheetContent>
          </Sheet>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-2 flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="md:hidden"
                onClick={() => setSidebarOpen(true)}
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
        </TabsContent>
        <TabsContent value="drafts" className="overflow-y-auto">
          <DraftsList canSendManual={canSendManual} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
