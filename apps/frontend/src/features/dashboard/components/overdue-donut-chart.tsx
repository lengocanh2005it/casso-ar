import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatVND } from '@/lib/format';

interface OverdueDonutChartProps {
  totalOutstanding: number;
  totalOverdue: number;
}

const COLORS = ['var(--chart-1)', 'var(--chart-5)'];
const GRADIENT_IDS = ['gradOnTime', 'gradOverdue'];

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { name: string; value: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-sm">
      <p className="font-medium">{item.name}</p>
      <p className="text-muted-foreground">{formatVND(item.value)}</p>
    </div>
  );
}

export function OverdueDonutChart({
  totalOutstanding,
  totalOverdue,
}: OverdueDonutChartProps) {
  const onTime = Math.max(0, totalOutstanding - totalOverdue);
  const data = [
    { name: 'Còn hạn', value: onTime },
    { name: 'Quá hạn', value: totalOverdue },
  ];

  if (totalOutstanding === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Chưa có dữ liệu công nợ.
      </div>
    );
  }

  const overdueRate =
    totalOutstanding > 0
      ? Math.round((totalOverdue / totalOutstanding) * 100)
      : 0;

  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(120px,160px)_1fr]">
      <div className="relative mx-auto aspect-square w-full max-w-[160px] sm:mx-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <defs>
              <linearGradient id={GRADIENT_IDS[0]} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={1} />
                <stop
                  offset="100%"
                  stopColor="var(--chart-1)"
                  stopOpacity={0.6}
                />
              </linearGradient>
              <linearGradient id={GRADIENT_IDS[1]} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--chart-5)" stopOpacity={1} />
                <stop
                  offset="100%"
                  stopColor="var(--chart-5)"
                  stopOpacity={0.6}
                />
              </linearGradient>
            </defs>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="56%"
              outerRadius="88%"
              paddingAngle={3}
              dataKey="value"
              stroke="var(--background)"
              strokeWidth={2}
            >
              {data.map((_, index) => (
                <Cell
                  key={data[index]?.name}
                  fill={`url(#${GRADIENT_IDS[index]})`}
                />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold tabular-nums leading-none">
            {overdueRate}
            <span className="ml-0.5 text-xs font-medium text-muted-foreground">
              %
            </span>
          </span>
        </div>
      </div>

      <div className="flex w-full flex-col justify-center gap-1.5">
        {data.map((item, index) => {
          const pct =
            totalOutstanding > 0
              ? Math.round((item.value / totalOutstanding) * 100)
              : 0;
          return (
            <div
              key={item.name}
              className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: COLORS[index] }}
                />
                <span className="truncate text-muted-foreground">
                  {item.name}
                </span>
              </div>
              <span className="shrink-0 text-xs tabular-nums">
                <span className="font-medium text-foreground">
                  {formatVND(item.value)}
                </span>
                <span className="ml-1 text-muted-foreground">({pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
