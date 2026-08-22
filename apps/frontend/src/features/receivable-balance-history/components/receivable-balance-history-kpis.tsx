import { CircleDollarSign, History, Users } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
      <Card className="border-info/30">
        <CardHeader className="flex flex-row items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-info/10 text-info">
            <History aria-hidden="true" className="size-4" />
          </div>
          <h2 className="text-sm font-medium text-muted-foreground">
            Tổng số thay đổi
          </h2>
        </CardHeader>
        <CardContent className="text-2xl font-semibold tabular-nums">
          {summary?.totalTransitions ?? 0}
        </CardContent>
      </Card>
      <Card className="border-warning/30">
        <CardHeader className="flex flex-row items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-warning/10 text-warning-foreground">
            <Users aria-hidden="true" className="size-4" />
          </div>
          <h2 className="text-sm font-medium text-muted-foreground">
            Khoản phải thu bị ảnh hưởng
          </h2>
        </CardHeader>
        <CardContent className="text-2xl font-semibold tabular-nums">
          {summary?.affectedReceivables ?? 0}
        </CardContent>
      </Card>
      <Card className="border-success/30">
        <CardHeader className="flex flex-row items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-success/10 text-success">
            <CircleDollarSign aria-hidden="true" className="size-4" />
          </div>
          <h2 className="text-sm font-medium text-muted-foreground">
            Số dư còn lại mới nhất
          </h2>
        </CardHeader>
        <CardContent className="text-2xl font-semibold tabular-nums">
          {formatVND(summary?.latestRemainingAmount ?? 0)}
        </CardContent>
      </Card>
    </div>
  );
}
