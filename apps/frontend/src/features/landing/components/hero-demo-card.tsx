import { useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { ReceivableStatusBadge } from '@/components/receivable-status-badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatVND } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DEMO_TRANSACTIONS } from '../landing-data';

export function HeroDemoCard() {
  const [index, setIndex] = useState(0);
  const reducedMotion = useReducedMotion();
  const transaction = DEMO_TRANSACTIONS[index];

  useEffect(() => {
    if (reducedMotion) return;

    const interval = window.setInterval(() => {
      setIndex((current) => (current + 1) % DEMO_TRANSACTIONS.length);
    }, 3200);
    return () => window.clearInterval(interval);
  }, [reducedMotion]);

  return (
    <Card className={cn('mx-auto w-full max-w-md border-border/70 shadow-lg')}>
      <CardHeader className="pb-3">
        <p className="text-xs text-muted-foreground">Giao dịch gần đây</p>
      </CardHeader>
      <CardContent className="space-y-3" aria-hidden="true">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{transaction.customer}</p>
            <p className="text-lg font-semibold tabular-nums">
              {formatVND(transaction.amountVnd)}
            </p>
          </div>
          <ReceivableStatusBadge status={transaction.status} />
        </div>
      </CardContent>
    </Card>
  );
}
