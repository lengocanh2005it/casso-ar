import { Permission, PlanId } from '@casso-ledger/shared-types';
import { Lock } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/auth-context';
import { hasPlanAccess } from '@/lib/plan-access';
import { hasPermission } from '@/lib/rbac';
import { useCopilotChat } from '../api/use-copilot';
import { MessageList } from '../components/message-list';
import { PendingActionCard } from '../components/pending-action-card';
import { UsageIndicator } from '../components/usage-indicator';

export function CopilotPage() {
  const { user } = useAuth();
  const [draft, setDraft] = useState('');
  const canSendManual = user
    ? hasPermission(user.role, Permission.REMINDER_SEND_MANUAL)
    : false;
  const {
    messages,
    pendingAction,
    isSending,
    send,
    confirm,
    cancel,
    busy,
    blockedByPendingAction,
  } = useCopilotChat(canSendManual);

  if (!user || !hasPlanAccess(user.subscriptionPlan, PlanId.STARTER)) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 p-6">
        <Lock className="h-8 w-8 text-muted-foreground" />
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

  return (
    <div className="flex h-full min-h-0 flex-col p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold sm:text-2xl">Copilot</h1>
        <UsageIndicator />
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-lg border p-4">
        <MessageList messages={messages} />
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
          aria-label="Enter question"
          placeholder="Hỏi về công nợ…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={isSending || blockedByPendingAction}
        />
        <Button
          type="submit"
          disabled={isSending || blockedByPendingAction || !draft.trim()}
        >
          {isSending ? 'Đang suy nghĩ…' : 'Send'}
        </Button>
      </form>
    </div>
  );
}
