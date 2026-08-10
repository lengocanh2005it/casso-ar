import { PlanId } from '@casso-ledger/shared-types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';

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

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {plans.map((plan) => (
        <Card
          className={plan.id === currentPlan ? 'ring-2 ring-primary' : ''}
          key={plan.id}
        >
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              {plan.id}
              {plan.id === currentPlan && <Badge>Hiện tại</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Khoản phải thu: {plan.receivables}</p>
            <p>Ngân hàng: {plan.connections}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
