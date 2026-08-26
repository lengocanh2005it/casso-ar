import { CircleAlert } from 'lucide-react';
import { TruncatedCopyId } from '@/components/shared/truncated-copy-id';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CopilotPendingAction } from '../types';

export function PendingActionCard({
  action,
  onConfirm,
  onCancel,
  busy,
}: {
  action: Pick<CopilotPendingAction, 'id' | 'payload' | 'receivableLabel'>;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <Card className="border-primary/20 bg-primary/[0.03] shadow-none dark:border-primary/30">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <CircleAlert
          aria-hidden="true"
          className="size-4 shrink-0 text-primary"
        />
        <CardTitle className="text-sm">
          Xác nhận gửi email nhắc thanh toán
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <p className="font-medium">
            {action.receivableLabel ?? 'Khoản phải thu'}
          </p>
          <p className="text-xs text-muted-foreground">
            Mã kỹ thuật: <TruncatedCopyId id={action.payload.receivableId} />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={onConfirm}>
            Xác nhận gửi
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onCancel}
          >
            Hủy
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Đề xuất này hết hạn sau 10 phút nếu chưa được xác nhận.
        </p>
      </CardContent>
    </Card>
  );
}
