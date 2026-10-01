import { Permission, PlanId } from '@casso-ar/shared-types';
import { useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  CircleAlert,
  LoaderCircle,
  Lock,
  Mail,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  Square,
} from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeading } from '@/components/layout/page-heading';
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
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [draft, setDraft] = useState('');
  const [historySheetOpen, setHistorySheetOpen] = useState(false);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [draftsSheetOpen, setDraftsSheetOpen] = useState(false);
  const [draftsCollapsed, setDraftsCollapsed] = useState(false);
  const gateRef = useRef<HTMLDivElement>(null);
  const canSendManual = user
    ? hasPermission(user.role, Permission.REMINDER_SEND_MANUAL)
    : false;
  const hasCopilotAccess = Boolean(
    user && hasPlanAccess(user.subscriptionPlan, PlanId.STARTER),
  );
  const canUpgrade = user
    ? hasPermission(user.role, Permission.SUBSCRIPTION_MANAGE)
    : false;

  useEffect(() => {
    if (hasCopilotAccess) return;

    const previousActiveElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    gateRef.current?.focus();

    return () => previousActiveElement?.focus();
  }, [hasCopilotAccess]);

  useEffect(() => {
    if (!hasCopilotAccess) {
      setHistorySheetOpen(false);
      setDraftsSheetOpen(false);
    }
  }, [hasCopilotAccess]);

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
    isLoadingHistory,
    quotaExceededMessage,
  } = useCopilotChat(canSendManual, activeConversationId, {
    onTurnComplete: () => {
      void refreshConversations();
      void queryClient.invalidateQueries({ queryKey: ['copilot-usage'] });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (
      !content ||
      isSending ||
      blockedByPendingAction ||
      quotaExceededMessage
    ) {
      return;
    }
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
      <div className="border-b border-border bg-muted/20 px-3 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
          Bản nháp email
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <DraftsList canSendManual={canSendManual} />
      </div>
    </div>
  );

  return (
    <div className="relative h-full overflow-hidden">
      <div
        aria-hidden={!hasCopilotAccess}
        className={cn(
          'flex h-full flex-col gap-4',
          !hasCopilotAccess && 'pointer-events-none select-none blur-sm',
        )}
        inert={!hasCopilotAccess ? true : undefined}
      >
        <PageHeading
          eyebrow="TRỢ LÝ THU HỒI"
          title="Copilot"
          description="Tra cứu công nợ và soạn email nhắc thanh toán."
          icon={Bot}
          tone="ai"
          actions={<UsageIndicator />}
        />
        <section
          aria-label="Không gian làm việc Copilot"
          className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card"
        >
          <aside
            className={cn(
              'hidden shrink-0 overflow-hidden border-r border-border bg-muted/20 transition-[width] duration-200 2xl:block',
              historyCollapsed ? 'w-0 border-0' : 'w-56',
            )}
          >
            <div className={cn('h-full w-56', historyCollapsed && 'invisible')}>
              {historySidebar}
            </div>
          </aside>
          {hasCopilotAccess && (
            <Sheet open={historySheetOpen} onOpenChange={setHistorySheetOpen}>
              <SheetContent side="left" className="w-64 p-0">
                {historySidebar}
              </SheetContent>
            </Sheet>
          )}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex min-h-12 items-center justify-between gap-2 px-3 pt-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="2xl:hidden"
                  onClick={() => setHistorySheetOpen(true)}
                  aria-label="Mở lịch sử chat"
                >
                  <Menu className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="hidden 2xl:inline-flex"
                  onClick={() => setHistoryCollapsed((current) => !current)}
                  aria-label={
                    historyCollapsed
                      ? 'Mở lịch sử chat'
                      : 'Thu gọn lịch sử chat'
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
                  className="2xl:hidden"
                  onClick={() => setDraftsSheetOpen(true)}
                  aria-label="Mở bản nháp email"
                >
                  <Mail className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="hidden 2xl:inline-flex"
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

            {/* The welcome card carries its own border and padding, so the
                scroll container skips its own padding to leave room for it. */}
            <div
              className={
                isEmptyConversation
                  ? 'mx-3 flex min-h-0 flex-1 flex-col overflow-hidden'
                  : 'mx-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5'
              }
            >
              {isLoadingHistory ? (
                <div className="flex flex-1 items-center justify-center">
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-6 animate-spin text-muted-foreground"
                  />
                </div>
              ) : isEmptyConversation ? (
                <CopilotWelcomeState
                  onSuggestionClick={(text) => void send(text)}
                />
              ) : (
                <MessageList
                  messages={messages}
                  streamingContent={streamingContent}
                  isWaitingForResponse={isSending && !streamingContent}
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
            {quotaExceededMessage && (
              <div className="mx-3 mb-3 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />
                <span>
                  {quotaExceededMessage}
                  {!canUpgrade && ' Liên hệ quản trị viên để nâng cấp gói.'}
                </span>
              </div>
            )}
            <form
              onSubmit={onSubmit}
              className="mx-3 mb-3 mt-3 flex gap-2 rounded-2xl border border-border bg-card p-2.5"
            >
              <Input
                name="question"
                autoComplete="off"
                aria-label="Enter question"
                placeholder="Hỏi về công nợ…"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="border-0 bg-transparent shadow-none"
                disabled={
                  isSending || blockedByPendingAction || !!quotaExceededMessage
                }
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
                  aria-label="Send"
                  disabled={
                    blockedByPendingAction ||
                    !!quotaExceededMessage ||
                    !draft.trim()
                  }
                >
                  Gửi
                </Button>
              )}
            </form>
          </div>

          <aside
            className={cn(
              'hidden shrink-0 overflow-hidden border-l border-border bg-muted/20 transition-[width] duration-200 2xl:block',
              draftsCollapsed ? 'w-0 border-0' : 'w-96',
            )}
          >
            <div className={cn('h-full w-96', draftsCollapsed && 'invisible')}>
              {draftsPanel}
            </div>
          </aside>
          {hasCopilotAccess && (
            <Sheet open={draftsSheetOpen} onOpenChange={setDraftsSheetOpen}>
              <SheetContent side="right" className="w-[90vw] max-w-sm p-0">
                {draftsPanel}
              </SheetContent>
            </Sheet>
          )}
        </section>
      </div>

      {!hasCopilotAccess && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-background/60 p-4">
          <div
            aria-describedby="copilot-gate-description"
            aria-labelledby="copilot-gate-title"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border bg-card p-6 text-center"
            ref={gateRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
              <Lock aria-hidden="true" className="size-6 text-primary" />
            </div>
            <h2
              className="mt-4 text-lg font-semibold text-foreground"
              id="copilot-gate-title"
            >
              Copilot đang bị khóa
            </h2>
            <p
              className="mt-2 text-sm text-muted-foreground"
              id="copilot-gate-description"
            >
              Tính năng Copilot yêu cầu gói Starter hoặc cao hơn.
            </p>
            {canUpgrade ? (
              <Button
                className="mt-5 gap-2"
                onClick={() => navigate('/settings?tab=billing')}
              >
                <Sparkles aria-hidden="true" className="size-4" />
                Nâng cấp gói
              </Button>
            ) : (
              <p className="mt-5 text-sm font-medium text-foreground">
                Liên hệ quản trị viên để nâng cấp gói.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
