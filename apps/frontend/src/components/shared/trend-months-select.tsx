import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isTrendMonths, TREND_MONTHS } from '@/features/reports/trend-months';
import type { TrendMonths } from '@/features/reports/types';

interface TrendMonthsSelectProps {
  value: TrendMonths;
  onValueChange: (months: TrendMonths) => void;
  className?: string;
}

export function TrendMonthsSelect({
  value,
  onValueChange,
  className = 'w-full sm:w-40',
}: TrendMonthsSelectProps) {
  function handleValueChange(nextValue: string) {
    const months = Number(nextValue);
    if (isTrendMonths(months)) {
      onValueChange(months);
    }
  }

  return (
    <Select value={String(value)} onValueChange={handleValueChange}>
      <SelectTrigger aria-label="Khoảng thời gian" className={className}>
        <SelectValue placeholder={`${value} tháng`} />
      </SelectTrigger>
      <SelectContent>
        {TREND_MONTHS.map((months) => (
          <SelectItem key={months} value={String(months)}>
            {months} tháng
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
