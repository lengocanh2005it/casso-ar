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

export function CopilotPage() {
  const { user } = useAuth();
  const [draft, setDraft] = useState('');
  const { messages, pendingAction, isSending, send, confirm, cancel, busy } =
    useCopilotChat();

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

  const canSendManual = hasPermission(
    user.role,
    Permission.REMINDER_SEND_MANUAL,
  );

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isSending || pendingAction) return;
    setDraft('');
    void send(content);
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col p-6">
      <h1 className="mb-4 text-2xl font-semibold">Copilot</h1>
      <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border p-4">
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
          disabled={isSending || Boolean(pendingAction)}
        />
        <Button
          type="submit"
          disabled={isSending || Boolean(pendingAction) || !draft.trim()}
        >
          {isSending ? 'Đang suy nghĩ…' : 'Send'}
        </Button>
      </form>
    </div>
  );
}
