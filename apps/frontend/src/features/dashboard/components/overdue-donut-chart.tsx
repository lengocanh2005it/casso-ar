import { formatVND } from '@/lib/format';

interface OverdueDonutChartProps {
  totalOutstanding: number;
  totalOverdue: number;
}

export function OverdueDonutChart({
  totalOutstanding,
  totalOverdue,
}: OverdueDonutChartProps) {
  const onTime = Math.max(0, totalOutstanding - totalOverdue);

  if (totalOutstanding === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Chưa có dữ liệu công nợ.
      </div>
    );
  }

  const overdueRate = Math.round((totalOverdue / totalOutstanding) * 100);
  const onTimeRate = 100 - overdueRate;

  const bars = [
    {
      name: 'Còn hạn',
      value: onTime,
      pct: onTimeRate,
      color: 'bg-emerald-500',
    },
    {
      name: 'Quá hạn',
      value: totalOverdue,
      pct: overdueRate,
      color: 'bg-red-500',
    },
  ];

  return (
    <div className="space-y-6">
      {bars.map((bar) => (
        <div key={bar.name} className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{bar.name}</span>
            <span className="tabular-nums">
              <span className="font-medium">{formatVND(bar.value)}</span>
              <span className="ml-1 text-muted-foreground">({bar.pct}%)</span>
            </span>
          </div>
          <div className="h-4 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${bar.color} transition-all duration-500`}
              style={{ width: `${bar.pct}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
