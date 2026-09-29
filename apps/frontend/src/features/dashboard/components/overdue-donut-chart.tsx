import { PieChart } from 'lucide-react';
import { EmptyState } from '@/components/layout/empty-state';
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
      <EmptyState
        density="compact"
        icon={PieChart}
        title="Chưa có công nợ"
        description="Tỷ lệ quá hạn sẽ hiển thị khi có khoản phải thu còn lại."
        className="h-72"
      />
    );
  }

  const overdueRate = Math.min(
    100,
    Math.max(0, Math.round((totalOverdue / totalOutstanding) * 100)),
  );
  const onTimeRate = 100 - overdueRate;

  const bars = [
    {
      name: 'Còn hạn',
      value: onTime,
      pct: onTimeRate,
      color: 'bg-success',
      surface: 'border-success/30 bg-success/10',
    },
    {
      name: 'Quá hạn',
      value: totalOverdue,
      pct: overdueRate,
      color: 'bg-destructive',
      surface: 'border-destructive/30 bg-destructive/10',
    },
  ];

  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-6 py-2">
      <div className="flex justify-center">
        <div
          role="img"
          aria-label={`Tỷ lệ công nợ: ${overdueRate}% quá hạn, ${onTimeRate}% còn hạn`}
          className="relative size-40 shrink-0 rounded-full p-3 shadow-inner"
          style={{
            background: `conic-gradient(var(--destructive) 0 ${overdueRate}%, var(--success) ${overdueRate}% 100%)`,
          }}
        >
          <div className="flex size-full flex-col items-center justify-center rounded-full bg-card">
            <span className="text-3xl font-bold tracking-tight tabular-nums">
              {overdueRate}%
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              quá hạn
            </span>
          </div>
        </div>
      </div>

      <div className="w-full max-w-lg space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Phân bổ công nợ
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {bars.map((bar) => (
            <div
              key={bar.name}
              className={`rounded-xl border p-3 ${bar.surface}`}
            >
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <span
                    aria-hidden="true"
                    className={`size-2 rounded-full ${bar.color}`}
                  />
                  {bar.name}
                </span>
                <span className="font-semibold tabular-nums">{bar.pct}%</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                {formatVND(bar.value)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
