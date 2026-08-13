import { PlanId, PlanUpgradeOrderStatus } from '@casso-ledger/shared-types';
import { PlanUpgradeOrder } from './plan-upgrade-order';

function buildOrder(status = PlanUpgradeOrderStatus.PENDING): PlanUpgradeOrder {
  return new PlanUpgradeOrder({
    id: 'order-1',
    orderCode: 1001,
    organizationId: 'org-1',
    targetPlanId: PlanId.STARTER,
    status,
    createdAt: new Date('2026-08-13T00:00:00Z'),
    updatedAt: new Date('2026-08-13T00:00:00Z'),
  });
}

describe('PlanUpgradeOrder', () => {
  it('markPaid() returns a new PAID instance and preserves other fields', () => {
    const order = buildOrder();
    const paid = order.markPaid();
    expect(paid.status).toBe(PlanUpgradeOrderStatus.PAID);
    expect(paid.id).toBe(order.id);
    expect(paid.orderCode).toBe(order.orderCode);
    expect(order.status).toBe(PlanUpgradeOrderStatus.PENDING);
  });

  it('markFailed() returns a new FAILED instance', () => {
    const failed = buildOrder().markFailed();
    expect(failed.status).toBe(PlanUpgradeOrderStatus.FAILED);
  });

  it('isTerminal() is false for PENDING and true for PAID/FAILED', () => {
    expect(buildOrder(PlanUpgradeOrderStatus.PENDING).isTerminal()).toBe(false);
    expect(buildOrder(PlanUpgradeOrderStatus.PAID).isTerminal()).toBe(true);
    expect(buildOrder(PlanUpgradeOrderStatus.FAILED).isTerminal()).toBe(true);
  });
});
