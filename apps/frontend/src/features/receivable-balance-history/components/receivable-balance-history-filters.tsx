import { ReceivableStatus } from '@casso-ar/shared-types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ReceivableBalanceHistoryChangeSource } from '../types';

export interface ReceivableBalanceHistoryFilterValues {
  from: string;
  to: string;
  receivableId: string;
  status: ReceivableStatus | '';
  changeSource: ReceivableBalanceHistoryChangeSource | '';
}

export const RECEIVABLE_STATUS_OPTIONS: Array<{
  value: ReceivableStatus;
  label: string;
}> = [
  { value: ReceivableStatus.DRAFT, label: 'Nháp' },
  { value: ReceivableStatus.OPEN, label: 'Mở' },
  { value: ReceivableStatus.PARTIALLY_PAID, label: 'Đã thu một phần' },
  { value: ReceivableStatus.PAID, label: 'Đã thu' },
  { value: ReceivableStatus.WRITTEN_OFF, label: 'Xóa nợ' },
  { value: ReceivableStatus.CANCELLED, label: 'Đã hủy' },
];

export const CHANGE_SOURCE_OPTIONS: Array<{
  value: ReceivableBalanceHistoryChangeSource;
  label: string;
}> = [
  { value: 'CREATE', label: 'Tạo mới' },
  { value: 'ALLOCATE', label: 'Phân bổ' },
  { value: 'UNDO', label: 'Hoàn tác' },
  { value: 'CANCEL', label: 'Hủy' },
  { value: 'WRITE_OFF', label: 'Xóa nợ' },
  { value: 'ROLLOUT_BASELINE', label: 'Dữ liệu khởi tạo' },
];

interface FiltersProps {
  values: ReceivableBalanceHistoryFilterValues;
  onChange: (next: ReceivableBalanceHistoryFilterValues) => void;
}

export function ReceivableBalanceHistoryFilters({
  values,
  onChange,
}: FiltersProps) {
  return (
    <div className="grid gap-4 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
      <div className="space-y-2">
        <Label htmlFor="audit-from">Từ ngày</Label>
        <Input
          id="audit-from"
          name="from"
          type="date"
          autoComplete="off"
          value={values.from}
          onChange={(event) =>
            onChange({ ...values, from: event.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="audit-to">Đến ngày</Label>
        <Input
          id="audit-to"
          name="to"
          type="date"
          autoComplete="off"
          value={values.to}
          onChange={(event) => onChange({ ...values, to: event.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="audit-receivable">Khoản phải thu</Label>
        <Input
          id="audit-receivable"
          name="receivableId"
          autoComplete="off"
          placeholder="Nhập mã kỹ thuật khoản phải thu"
          value={values.receivableId}
          onChange={(event) =>
            onChange({ ...values, receivableId: event.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="audit-status">Trạng thái</Label>
        <Select
          value={values.status || undefined}
          onValueChange={(status) =>
            onChange({ ...values, status: status as ReceivableStatus })
          }
        >
          <SelectTrigger
            id="audit-status"
            aria-label="Trạng thái"
            className="w-full"
          >
            <SelectValue placeholder="Tất cả" />
          </SelectTrigger>
          <SelectContent>
            {RECEIVABLE_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="audit-source">Nguồn thay đổi</Label>
        <Select
          value={values.changeSource || undefined}
          onValueChange={(changeSource) =>
            onChange({
              ...values,
              changeSource:
                changeSource as ReceivableBalanceHistoryChangeSource,
            })
          }
        >
          <SelectTrigger
            id="audit-source"
            aria-label="Nguồn thay đổi"
            className="w-full"
          >
            <SelectValue placeholder="Tất cả" />
          </SelectTrigger>
          <SelectContent>
            {CHANGE_SOURCE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
