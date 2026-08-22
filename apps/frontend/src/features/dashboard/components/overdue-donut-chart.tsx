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
      color: 'bg-emerald-500',
      surface:
        'border-emerald-100 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/20',
    },
    {
      name: 'Quá hạn',
      value: totalOverdue,
      pct: overdueRate,
      color: 'bg-red-500',
      surface:
        'border-red-100 bg-red-50/60 dark:border-red-900/60 dark:bg-red-950/20',
    },
  ];

  return (
    <div className="grid min-h-64 items-center gap-6 py-2 sm:grid-cols-[minmax(9rem,11rem)_1fr]">
      <div className="flex justify-center">
        <div
          role="img"
          aria-label={`Tỷ lệ công nợ: ${overdueRate}% quá hạn, ${onTimeRate}% còn hạn`}
          className="relative size-40 shrink-0 rounded-full p-3 shadow-inner"
          style={{
            background: `conic-gradient(#ef4444 0 ${overdueRate}%, #10b981 ${overdueRate}% 100%)`,
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

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Phân bổ công nợ
        </p>
        <div className="space-y-3">
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
