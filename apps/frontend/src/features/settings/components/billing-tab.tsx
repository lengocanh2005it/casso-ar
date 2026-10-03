import { Permission, PlanId } from '@casso-ar/shared-types';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';
import { hasPermission } from '@/lib/rbac';
import { useInitiatePlanUpgrade } from '../api/use-settings';
import { PaymentDialog } from './payment-dialog';

const planLabels: Record<PlanId, string> = {
  [PlanId.FREE]: 'Miễn phí',
  [PlanId.STARTER]: 'Khởi đầu',
  [PlanId.BUSINESS]: 'Chuyên nghiệp',
  [PlanId.ENTERPRISE]: 'Doanh nghiệp',
};

// Ascending tier order — index position doubles as the upgrade-eligibility rule.
const plans = [
  { id: PlanId.FREE, receivables: '50 / tháng', connections: '1 kết nối' },
  { id: PlanId.STARTER, receivables: '200 / tháng', connections: '3 kết nối' },
  {
    id: PlanId.BUSINESS,
    receivables: '1.000 / tháng',
    connections: '10 kết nối',
  },
  {
    id: PlanId.ENTERPRISE,
    receivables: 'Không giới hạn',
    connections: 'Không giới hạn',
  },
];

export function BillingTab() {
  const { user } = useAuth();
  const currentPlan = user?.subscriptionPlan ?? PlanId.FREE;
  const currentPlanIndex = plans.findIndex((plan) => plan.id === currentPlan);
  const canUpgrade = hasPermission(user?.role, Permission.SUBSCRIPTION_MANAGE);
  const { mutate, isPending } = useInitiatePlanUpgrade();
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

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

  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
      {plans.map((plan, index) => (
        <Card
          className={
            plan.id === currentPlan
              ? 'border-success/40 ring-2 ring-success/30'
              : ''
          }
          key={plan.id}
        >
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              {planLabels[plan.id]}
              {plan.id === currentPlan && <Badge>Hiện tại</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Khoản phải thu: {plan.receivables}</p>
            <p>Ngân hàng: {plan.connections}</p>
            {canUpgrade && index > currentPlanIndex && (
              <Button
                size="sm"
                className="w-full"
                disabled={isPending}
                onClick={() => handleUpgrade(plan.id)}
              >
                Nâng cấp
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
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
