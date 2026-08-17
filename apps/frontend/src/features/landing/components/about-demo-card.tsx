import { ReceivableStatus } from '@casso-ledger/shared-types';
import { ArrowLeftRight } from 'lucide-react';
import { ReceivableStatusBadge } from '@/components/receivable-status-badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatVND } from '@/lib/format';
import { DEMO_TRANSACTIONS } from '../landing-data';

const MATCHED_TRANSACTION = DEMO_TRANSACTIONS[0];

export function AboutDemoCard() {
  return (
    <Card className="mx-auto w-full max-w-md border-border/70 shadow-lg">
      <CardHeader className="pb-3">
        <p className="text-xs text-muted-foreground">Giao dịch ngân hàng</p>
      </CardHeader>
      <CardContent className="space-y-3" aria-hidden="true">
        <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2.5">
          <p className="truncate text-sm font-medium">
            {MATCHED_TRANSACTION.customer}
          </p>
          <p className="text-base font-semibold tabular-nums">
            {formatVND(MATCHED_TRANSACTION.amountVnd)}
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <ArrowLeftRight className="size-4" />
          <span className="text-xs">Đối chiếu tự động</span>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
          <p className="truncate text-sm font-medium">
            {MATCHED_TRANSACTION.customer}
          </p>
          <ReceivableStatusBadge status={ReceivableStatus.PAID} />
        </div>
      </CardContent>
    </Card>
  );
}
