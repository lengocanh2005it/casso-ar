import { CircleDollarSign, History, Users } from 'lucide-react';
import { MetricCard } from '@/components/metric-card';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatVND } from '@/lib/format';
import type { ReceivableBalanceHistorySummary } from '../types';

interface KpisProps {
  summary: ReceivableBalanceHistorySummary | undefined;
  isLoading: boolean;
}

export function ReceivableBalanceHistoryKpis({
  summary,
  isLoading,
}: KpisProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {['total', 'affected', 'remaining'].map((skeletonKey) => (
          <Card key={skeletonKey}>
            <CardContent className="p-6">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <MetricCard
        label="Tổng số thay đổi"
        description="Số lần số dư công nợ thay đổi trong khoảng đã chọn"
        value={String(summary?.totalTransitions ?? 0)}
        icon={History}
      />
      <MetricCard
        label="Khoản phải thu bị ảnh hưởng"
        description="Số khoản phải thu có ít nhất một thay đổi"
        value={String(summary?.affectedReceivables ?? 0)}
        icon={Users}
        variant="warning"
      />
      <MetricCard
        label="Số dư còn lại mới nhất"
        description="Tổng còn lại tại thay đổi gần nhất"
        value={formatVND(summary?.latestRemainingAmount ?? '0')}
        amount={summary?.latestRemainingAmount ?? '0'}
        icon={CircleDollarSign}
        variant="success"
      />
    </div>
  );
}
