import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Tổng số thay đổi
          </CardTitle>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">
          {summary?.totalTransitions ?? 0}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Khoản phải thu bị ảnh hưởng
          </CardTitle>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">
          {summary?.affectedReceivables ?? 0}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Số dư còn lại mới nhất
          </CardTitle>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">
          {formatVND(summary?.latestRemainingAmount ?? 0)}
        </CardContent>
      </Card>
    </div>
  );
}
