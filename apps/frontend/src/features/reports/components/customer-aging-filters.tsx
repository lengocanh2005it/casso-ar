import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AgingBucket } from '../types';

export const AGING_BUCKET_ORDER: AgingBucket[] = [
  'NOT_DUE',
  'OVERDUE_1_7',
  'OVERDUE_8_30',
  'OVERDUE_31_60',
  'OVERDUE_60_PLUS',
];

export const AGING_BUCKET_LABELS: Record<AgingBucket, string> = {
  NOT_DUE: 'Chưa đến hạn',
  OVERDUE_1_7: 'Quá hạn 1–7 ngày',
  OVERDUE_8_30: 'Quá hạn 8–30 ngày',
  OVERDUE_31_60: 'Quá hạn 31–60 ngày',
  OVERDUE_60_PLUS: 'Quá hạn trên 60 ngày',
};

export type AgingBucketFilter = AgingBucket | 'ALL';

interface CustomerAgingFiltersProps {
  search: string;
  bucket: AgingBucketFilter;
  onSearchChange: (search: string) => void;
  onBucketChange: (bucket: AgingBucketFilter) => void;
}

export function CustomerAgingFilters({
  search,
  bucket,
  onSearchChange,
  onBucketChange,
}: CustomerAgingFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        aria-label="Tìm khách hàng"
        placeholder="Tìm theo tên, mã số thuế hoặc số điện thoại"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        className="max-w-lg"
      />
      <Select
        value={bucket}
        onValueChange={(value) => onBucketChange(value as AgingBucketFilter)}
      >
        <SelectTrigger aria-label="Bộ lọc tuổi nợ" className="w-56">
          <SelectValue placeholder="Tất cả" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Tất cả</SelectItem>
          {AGING_BUCKET_ORDER.map((bucketOption) => (
            <SelectItem key={bucketOption} value={bucketOption}>
              {AGING_BUCKET_LABELS[bucketOption]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
