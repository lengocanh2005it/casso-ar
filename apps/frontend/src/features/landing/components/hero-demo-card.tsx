import { useReducedMotion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ReceivableStatusBadge } from '@/components/receivable-status-badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatVND } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DEMO_TRANSACTIONS } from '../landing-data';

export function HeroDemoCard() {
  const [highlightIndex, setHighlightIndex] = useState(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;

    const interval = window.setInterval(() => {
      setHighlightIndex((current) => (current + 1) % DEMO_TRANSACTIONS.length);
    }, 3200);
    return () => window.clearInterval(interval);
  }, [reducedMotion]);

  return (
    <div className="relative mx-auto w-full max-w-md">
      <Card className="border-border/70 shadow-lg">
        <CardHeader className="pb-3">
          <p className="text-xs text-muted-foreground">Giao dịch gần đây</p>
        </CardHeader>
        <CardContent className="space-y-2" aria-hidden="true">
          {DEMO_TRANSACTIONS.map((transaction, i) => (
            <div
              key={transaction.customer}
              className={cn(
                'flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors duration-200 ease-out motion-reduce:transition-none',
                i === highlightIndex
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-transparent',
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {transaction.customer}
                </p>
                <p className="text-base font-semibold tabular-nums">
                  {formatVND(transaction.amountVnd)}
                </p>
              </div>
              <ReceivableStatusBadge status={transaction.status} />
            </div>
          ))}
        </CardContent>
      </Card>

      <div
        className="absolute -right-4 -bottom-4 hidden items-center gap-2 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-lg sm:flex"
        aria-hidden="true"
      >
        <Sparkles className="size-4 text-primary" />
        <div>
          <p className="text-xs font-medium">Đối chiếu tự động</p>
          <p className="text-[11px] text-muted-foreground">
            Theo thời gian thực
          </p>
        </div>
      </div>
    </div>
  );
}
