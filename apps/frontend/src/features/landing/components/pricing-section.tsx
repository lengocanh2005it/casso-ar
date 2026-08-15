import { PlanId } from '@casso-ledger/shared-types';
import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatVND } from '@/lib/format';
import { cn } from '@/lib/utils';
import { usePlans } from '../hooks/use-plans';
import { PLAN_FEATURE_COPY, PLAN_LABELS } from '../landing-data';

export function PricingSection() {
  const { data: plans, isError, isLoading } = usePlans();

  return (
    <section id="bang-gia" className="scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Gói dịch vụ linh hoạt
          </h2>
        </div>

        {isLoading ? (
          <p className="mt-12 text-center text-base text-muted-foreground">
            Đang tải bảng giá...
          </p>
        ) : isError ? (
          <p className="mt-12 text-center text-base text-muted-foreground">
            Không thể tải bảng giá. Vui lòng thử lại sau.
          </p>
        ) : (
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {plans?.map((plan) => {
              const isHighlighted = plan.planId === PlanId.BUSINESS;
              const quantitativeBullets = [
                `${plan.receivableMonthlyLimit.toLocaleString('vi-VN')} khoản phải thu/tháng`,
                `${plan.bankConnectionLimit} kết nối ngân hàng`,
                `${plan.copilotChatMonthlyLimit.toLocaleString('vi-VN')} lượt hỏi đáp/tháng`,
              ];
              const allFeatures = [
                ...quantitativeBullets,
                ...PLAN_FEATURE_COPY[plan.planId],
              ];

              return (
                <Card
                  key={plan.planId}
                  className={cn(
                    'relative flex flex-col',
                    isHighlighted
                      ? 'border-primary ring-1 ring-primary/20'
                      : 'border-border/70',
                  )}
                >
                  {isHighlighted ? (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground">
                        Phổ biến nhất
                      </Badge>
                    </div>
                  ) : null}
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">
                      {PLAN_LABELS[plan.planId]}
                    </CardTitle>
                    <div className="mt-2">
                      <span className="text-[1.75rem] font-bold leading-none tracking-tight tabular-nums">
                        {plan.priceVnd === 0
                          ? 'Miễn phí'
                          : formatVND(plan.priceVnd)}
                      </span>
                      {plan.priceVnd > 0 ? (
                        <span className="text-base text-muted-foreground">
                          /tháng
                        </span>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col">
                    <ul className="mb-6 flex-1 space-y-2.5">
                      {allFeatures.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-2 text-base"
                        >
                          <Check className="mt-1 size-4 shrink-0 text-primary" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      variant={isHighlighted ? 'default' : 'outline'}
                      className="min-h-11 w-full"
                      asChild
                    >
                      <Link to="/signup">Dùng thử miễn phí</Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
