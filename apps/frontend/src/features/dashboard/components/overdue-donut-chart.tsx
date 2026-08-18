import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatVND } from '@/lib/format';

interface OverdueDonutChartProps {
  totalOutstanding: number;
  totalOverdue: number;
}

const COLORS = ['var(--chart-2)', 'var(--chart-5)'];

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

  return (
    <div className="flex items-center gap-6">
      <div className="h-48 w-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="56%"
              outerRadius="88%"
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((_, index) => (
                <Cell key={data[index]?.name} fill={COLORS[index]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatVND(Number(value))} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-3">
        {data.map((item, index) => (
          <div key={item.name} className="flex items-center gap-2 text-sm">
            <div
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: COLORS[index] }}
            />
            <span className="text-muted-foreground">{item.name}</span>
            <span className="ml-auto font-medium tabular-nums">
              {formatVND(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
