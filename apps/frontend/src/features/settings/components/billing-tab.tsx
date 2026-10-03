import { Permission, PlanId } from '@casso-ar/shared-types';
import {
  Check,
  CreditCard,
  Landmark,
  MessagesSquare,
  ReceiptText,
  RefreshCw,
} from 'lucide-react';
import { useState } from 'react';
import { SectionHeading } from '@/components/layout/section-heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';
import { usePlans } from '@/features/plans/hooks/use-plans';
import { PLAN_FEATURE_COPY, PLAN_LABELS } from '@/features/plans/plans-data';
import { formatVND } from '@/lib/format';
import { hasPermission } from '@/lib/rbac';
import { useInitiatePlanUpgrade } from '../api/use-settings';
import { PaymentDialog } from './payment-dialog';

const numberFormatter = new Intl.NumberFormat('vi-VN');

// Keep these in ascending tier order; index position controls upgrade eligibility.
const plans = [
  { id: PlanId.FREE },
  { id: PlanId.STARTER },
  { id: PlanId.BUSINESS },
  { id: PlanId.ENTERPRISE },
];

export function BillingTab() {
  const { user } = useAuth();
  const currentPlan = user?.subscriptionPlan ?? PlanId.FREE;
  const currentPlanIndex = plans.findIndex((plan) => plan.id === currentPlan);
  const canUpgrade = hasPermission(user?.role, Permission.SUBSCRIPTION_MANAGE);
  const { mutate, isPending } = useInitiatePlanUpgrade();
  const { data: catalog, isLoading, refetch } = usePlans();
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const heading = (
    <SectionHeading
      icon={CreditCard}
      title="Thanh toán"
      description="Quản lý gói dịch vụ, giới hạn sử dụng và nâng cấp."
      action={
        <span className="text-xs text-muted-foreground">
          Giá thanh toán theo tháng
        </span>
      }
    />
  );

  function handleUpgrade(targetPlanId: PlanId) {
    const origin = window.location.origin;
    mutate(
      {
        targetPlanId,
        returnUrl: `${origin}/settings?tab=billing&status=success`,
        cancelUrl: `${origin}/settings?tab=billing&status=cancel`,
      },
      { onSuccess: (result) => setCheckoutUrl(result.checkoutUrl) },
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {heading}
        <div
          className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4"
          role="status"
        >
          <span className="sr-only">Đang tải các gói dịch vụ</span>
          {plans.map(({ id }) => (
            <div
              key={id}
              aria-hidden="true"
              className="h-64 animate-pulse rounded-lg border bg-muted/40 motion-reduce:animate-none"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!catalog?.length) {
    return (
      <div className="space-y-4">
        {heading}
        <div
          className="flex flex-col items-start gap-3 rounded-lg border border-border p-5 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <div>
            <h3 className="font-medium">Không thể tải thông tin gói</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Thử tải lại để xem giá và giới hạn mới nhất.
            </p>
          </div>
          <Button variant="outline" onClick={() => void refetch()}>
            <RefreshCw aria-hidden="true" />
            Thử lại
          </Button>
        </div>
      </div>
    );
  }

  const catalogById = new Map(
    catalog.map((entry) => [entry.planId, entry] as const),
  );
  const planCards = plans.flatMap((plan, index) => {
    const details = catalogById.get(plan.id);
    return details ? [{ plan, details, index }] : [];
  });

  return (
    <div className="space-y-4">
      {heading}
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        {planCards.map(({ plan, details, index }) => {
          const isCurrent = plan.id === currentPlan;
          const price =
            details.priceVnd === 0 ? 'Miễn phí' : formatVND(details.priceVnd);

          return (
            <Card
              className={
                isCurrent
                  ? 'flex h-full flex-col border-primary/60 bg-primary/[0.02] ring-2 ring-primary/15'
                  : 'flex h-full flex-col'
              }
              key={plan.id}
            >
              <CardHeader className="gap-3 pb-4">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  {PLAN_LABELS[plan.id]}
                  {isCurrent && <Badge>Gói hiện tại</Badge>}
                </CardTitle>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Giá gói</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-semibold tabular-nums tracking-tight">
                      {price}
                    </span>
                    {details.priceVnd > 0 && (
                      <span className="text-sm text-muted-foreground">
                        /tháng
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="flex flex-1 flex-col">
                <ul className="space-y-2.5 text-sm">
                  <li className="flex items-start gap-2.5">
                    <ReceiptText
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span>
                      <strong className="font-medium">
                        {numberFormatter.format(details.receivableMonthlyLimit)}
                      </strong>{' '}
                      khoản phải thu/tháng
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Landmark
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span>
                      <strong className="font-medium">
                        {numberFormatter.format(details.bankConnectionLimit)}
                      </strong>{' '}
                      kết nối ngân hàng
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <MessagesSquare
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span>
                      <strong className="font-medium">
                        {numberFormatter.format(
                          details.copilotChatMonthlyLimit,
                        )}
                      </strong>{' '}
                      lượt hỏi đáp AI/tháng
                    </span>
                  </li>
                </ul>

                <div className="my-4 border-t" />

                <h4 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                  Điểm nổi bật
                </h4>
                <ul className="space-y-2 text-sm">
                  {PLAN_FEATURE_COPY[plan.id].map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {canUpgrade && index > currentPlanIndex && (
                  <div className="mt-auto pt-5">
                    <Button
                      className="min-h-10 w-full"
                      disabled={isPending}
                      onClick={() => handleUpgrade(plan.id)}
                    >
                      Nâng cấp
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {checkoutUrl && (
        <PaymentDialog
          open
          onOpenChange={(open) => !open && setCheckoutUrl(null)}
          checkoutUrl={checkoutUrl}
        />
      )}
    </div>
  );
}
