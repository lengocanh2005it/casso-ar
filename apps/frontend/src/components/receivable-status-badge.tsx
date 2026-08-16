import { Badge } from '@/components/ui/badge';
import type { ReceivableStatus } from '@/features/receivables/types';

const LABELS: Record<ReceivableStatus, string> = {
  DRAFT: 'Nháp',
  OPEN: 'Đang thu',
  PARTIALLY_PAID: 'Đã trả một phần',
  PAID: 'Đã thu đủ',
  WRITTEN_OFF: 'Đã xóa nợ',
  CANCELLED: 'Đã hủy',
};

const STYLES: Record<ReceivableStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  OPEN: 'bg-info/10 text-info',
  PARTIALLY_PAID: 'bg-warning/10 text-warning',
  PAID: 'bg-success/10 text-success',
  WRITTEN_OFF: 'bg-destructive/10 text-destructive',
  CANCELLED: 'bg-muted text-muted-foreground',
};

export function ReceivableStatusBadge({
  status,
}: {
  status: ReceivableStatus;
}) {
  return <Badge className={STYLES[status]}>{LABELS[status]}</Badge>;
}
