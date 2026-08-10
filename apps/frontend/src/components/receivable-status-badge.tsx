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
  OPEN: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  PARTIALLY_PAID:
    'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  PAID: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  WRITTEN_OFF: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  CANCELLED: 'bg-muted text-muted-foreground',
};

export function ReceivableStatusBadge({
  status,
}: {
  status: ReceivableStatus;
}) {
  return <Badge className={STYLES[status]}>{LABELS[status]}</Badge>;
}
