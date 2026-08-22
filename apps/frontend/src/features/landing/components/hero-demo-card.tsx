import { motion, useReducedMotion } from 'framer-motion';
import { Landmark, ReceiptText, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ReceivableStatusBadge } from '@/components/receivable-status-badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatVND } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DEMO_TRANSACTIONS } from '../landing-data';

function LiveDot() {
  return (
    <span className="relative flex size-2">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60 motion-reduce:hidden" />
      <span className="relative inline-flex size-2 rounded-full bg-primary" />
    </span>
  );
}

function DemoChip({
  icon: Icon,
  eyebrow,
  customer,
  amountVnd,
  badge,
}: {
  icon: typeof Landmark;
  eyebrow: string;
  customer: string;
  amountVnd: number;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-border/70 bg-background px-4 py-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{eyebrow}</p>
        <p className="mt-0.5 truncate text-sm font-medium">{customer}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <p className="text-sm font-semibold tabular-nums">
          {formatVND(amountVnd)}
        </p>
        {badge}
      </div>
    </div>
  );
}

export function HeroDemoCard() {
  const [activeIndex, setActiveIndex] = useState(0);
  const reducedMotion = useReducedMotion();
  const active = DEMO_TRANSACTIONS[activeIndex];

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % DEMO_TRANSACTIONS.length);
    }, 3200);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <Card className="border-border/70 py-7 shadow-lg" aria-hidden="true">
      <CardHeader className="flex-row items-center justify-between gap-2 pb-4">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="size-3.5" aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold">Đối chiếu tự động</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LiveDot />
          Theo thời gian thực
        </span>
      </CardHeader>
      <CardContent>
        <motion.div
          key={activeIndex}
          initial={reducedMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="flex flex-col items-stretch"
        >
          <DemoChip
            icon={Landmark}
            eyebrow="Giao dịch ngân hàng"
            customer={active.customer}
            amountVnd={active.amountVnd}
          />

          <div className="relative mx-auto flex h-10 w-px items-stretch justify-center bg-border">
            {!reducedMotion && (
              <motion.span
                className="absolute left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-primary"
                animate={{ top: ['0%', '85%'] }}
                transition={{
                  duration: 1.1,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: 'easeInOut',
                }}
              />
            )}
          </div>

          <DemoChip
            icon={ReceiptText}
            eyebrow="Công nợ khớp"
            customer={active.customer}
            amountVnd={active.amountVnd}
            badge={<ReceivableStatusBadge status={active.status} />}
          />
        </motion.div>

        <div className="mt-6 flex items-center justify-center gap-1.5">
          {DEMO_TRANSACTIONS.map((transaction, index) => (
            <span
              key={transaction.customer}
              data-testid="hero-demo-progress-dot"
              className={cn(
                'h-1.5 rounded-full bg-primary/20 transition-all duration-300',
                index === activeIndex ? 'w-5 bg-primary' : 'w-1.5',
              )}
            />
          ))}
        </div>

        <div className="mt-6 grid grid-cols-2 border-t border-border/70 pt-5">
          <div className="border-r border-border/70 text-center">
            <p className="text-lg font-semibold text-primary">126</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Giao dịch đã khớp tháng này
            </p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-primary">~3s</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Thời gian khớp trung bình
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
