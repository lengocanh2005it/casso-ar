import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useConfirmCopilotDraft,
  useCopilotDrafts,
  useReopenCopilotDraft,
} from '../api/use-copilot-drafts';
import type { CopilotDraftStatus } from '../types';

const STATUS_LABEL: Record<CopilotDraftStatus, string> = {
  DRAFTED: 'Chưa gửi đề xuất',
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã gửi',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Đã hết hạn',
};

const REOPENABLE: CopilotDraftStatus[] = ['DRAFTED', 'CANCELLED', 'EXPIRED'];

export function DraftsList({ canSendManual }: { canSendManual: boolean }) {
  const { data, isLoading } = useCopilotDrafts(1);
  const reopen = useReopenCopilotDraft();
  const confirm = useConfirmCopilotDraft();

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Đang tải…</p>;
  }

  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Chưa có bản nháp email nào.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((draft) => (
        <Card key={draft.id}>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">{draft.subject}</CardTitle>
            <Badge variant="secondary">{STATUS_LABEL[draft.status]}</Badge>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">{draft.recipientEmail}</p>
            {canSendManual && (
              <div className="flex gap-2">
                {draft.status === 'PENDING' && draft.pendingActionId && (
                  <Button
                    size="sm"
                    disabled={confirm.isPending}
                    onClick={() => {
                      if (!draft.pendingActionId) return;
                      confirm.mutate(draft.pendingActionId, {
                        onSuccess: () =>
                          toast.success('Đã gửi email nhắc thanh toán.'),
                        onError: () =>
                          toast.error('Không thể gửi email nhắc thanh toán.'),
                      });
                    }}
                  >
                    Confirm
                  </Button>
                )}
                {REOPENABLE.includes(draft.status) && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={reopen.isPending}
                    onClick={() => {
                      reopen.mutate(draft.id, {
                        onError: () =>
                          toast.error('Không thể mở lại bản nháp này.'),
                      });
                    }}
                  >
                    Reopen
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
