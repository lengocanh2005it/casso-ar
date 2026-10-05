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
import { formatPlanPrice, formatUnavailable } from '@/lib/format';
import { hasPermission } from '@/lib/rbac';
import { useInitiatePlanUpgrade } from '../api/use-settings';
import { PaymentDialog } from './payment-dialog';
import { PlanPaymentHistory } from './plan-payment-history';

// Keep these in ascending tier order; index position controls upgrade eligibility.
const plans = [
  { id: PlanId.FREE },
  { id: PlanId.STARTER },
  { id: PlanId.BUSINESS },
  { id: PlanId.ENTERPRISE },
];

function CatalogAlert({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="flex flex-col items-start gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <Button variant="outline" onClick={onRetry}>
        <RefreshCw aria-hidden="true" />
        Thử lại
      </Button>
    </div>
  );
}

export function BillingTab() {
  const { user } = useAuth();
  const currentPlan = user?.subscriptionPlan ?? PlanId.FREE;
  const currentPlanIndex = plans.findIndex((plan) => plan.id === currentPlan);
  const canUpgrade = hasPermission(user?.role, Permission.SUBSCRIPTION_MANAGE);
  const { mutate, isPending } = useInitiatePlanUpgrade();
  const { data: catalog, isLoading, isError, refetch } = usePlans();
  const [checkout, setCheckout] = useState<{
    checkoutUrl: string;
    orderCode: string;
  } | null>(null);
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
        returnUrl: `${origin}/settings?tab=billing`,
        cancelUrl: `${origin}/settings?tab=billing`,
      },
      { onSuccess: setCheckout },
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

  const catalogById = new Map(
    (catalog ?? []).map((entry) => [entry.planId, entry] as const),
  );
  const hasCatalog = Boolean(catalog?.length);

  return (
    <div className="space-y-4">
      {heading}

      {!hasCatalog && (
        <CatalogAlert
          title="Không thể tải thông tin gói"
          description={
            isError
              ? 'Thử tải lại để xem giá và giới hạn mới nhất.'
              : 'Chưa có thông tin giá và giới hạn cho các gói.'
          }
          onRetry={() => void refetch()}
        />
      )}

      {isError && hasCatalog && (
        <CatalogAlert
          title="Chưa cập nhật được giá và giới hạn"
          description="Đang hiển thị thông tin gói đã tải trước đó, có thể chưa còn chính xác."
          onRetry={() => void refetch()}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        {plans.map((plan, index) => {
          const catalogEntry = catalogById.get(plan.id);
          const isCurrent = plan.id === currentPlan;
          const price = formatPlanPrice(catalogEntry?.priceVnd);

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
                    {catalogEntry !== undefined &&
                      catalogEntry.priceVnd > 0 && (
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
                        {formatUnavailable(
                          catalogEntry?.receivableMonthlyLimit,
                        )}
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
                        {formatUnavailable(catalogEntry?.bankConnectionLimit)}
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
                        {formatUnavailable(
                          catalogEntry?.copilotChatMonthlyLimit,
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

      {canUpgrade && (
        <PlanPaymentHistory
          checkoutUrl={checkout?.checkoutUrl}
          checkoutOrderCode={checkout?.orderCode}
        />
      )}

      {checkout && (
        <PaymentDialog
          open
          onOpenChange={(open) => !open && setCheckout(null)}
          checkoutUrl={checkout.checkoutUrl}
        />
      )}
    </div>
  );
}
