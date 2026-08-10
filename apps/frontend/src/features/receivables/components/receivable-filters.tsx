import { ReceivableStatus as SharedReceivableStatus } from '@casso-ledger/shared-types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ReceivableStatus } from '../types';

const STATUS_OPTIONS: Array<{ value: ReceivableStatus; label: string }> = [
  { value: SharedReceivableStatus.DRAFT, label: 'Nháp' },
  { value: SharedReceivableStatus.OPEN, label: 'Đang thu' },
  {
    value: SharedReceivableStatus.PARTIALLY_PAID,
    label: 'Đã trả một phần',
  },
  { value: SharedReceivableStatus.PAID, label: 'Đã thu đủ' },
  { value: SharedReceivableStatus.WRITTEN_OFF, label: 'Đã xóa nợ' },
  { value: SharedReceivableStatus.CANCELLED, label: 'Đã hủy' },
];

export function ReceivableFilters({
  status,
  onStatusChange,
}: {
  status?: ReceivableStatus;
  onStatusChange: (status: ReceivableStatus | undefined) => void;
}) {
  return (
    <Select
      value={status ?? 'ALL'}
      onValueChange={(value) =>
        onStatusChange(
          value === 'ALL' ? undefined : (value as ReceivableStatus),
        )
      }
    >
      <SelectTrigger aria-label="Lọc theo trạng thái" className="w-52">
        <SelectValue placeholder="Tất cả trạng thái" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
        {STATUS_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
