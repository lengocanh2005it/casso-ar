import { PlanId, PlanUpgradeOrderStatus } from '@casso-ar/shared-types';

export interface PlanUpgradeOrderProps {
  id: string;
  orderCode: number;
  organizationId: string;
  targetPlanId: PlanId;
  quotedAmount: number | null;
  payosPaymentLinkId: string | null;
  status: PlanUpgradeOrderStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class PlanUpgradeOrder {
  readonly id: string;
  readonly orderCode: number;
  readonly organizationId: string;
  readonly targetPlanId: PlanId;
  readonly quotedAmount: number | null;
  readonly payosPaymentLinkId: string | null;
  readonly status: PlanUpgradeOrderStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: PlanUpgradeOrderProps) {
    this.id = props.id;
    this.orderCode = props.orderCode;
    this.organizationId = props.organizationId;
    this.targetPlanId = props.targetPlanId;
    this.quotedAmount = props.quotedAmount;
    this.payosPaymentLinkId = props.payosPaymentLinkId;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  markPaid(): PlanUpgradeOrder {
    return new PlanUpgradeOrder({
      ...this,
      status: PlanUpgradeOrderStatus.PAID,
      updatedAt: new Date(),
    });
  }

  withPayosPaymentLinkId(paymentLinkId: string): PlanUpgradeOrder {
    return new PlanUpgradeOrder({ ...this, payosPaymentLinkId: paymentLinkId });
  }

  markFailed(): PlanUpgradeOrder {
    return new PlanUpgradeOrder({
      ...this,
      status: PlanUpgradeOrderStatus.FAILED,
      updatedAt: new Date(),
    });
  }

  markReviewRequired(): PlanUpgradeOrder {
    return new PlanUpgradeOrder({
      ...this,
      status: PlanUpgradeOrderStatus.REVIEW_REQUIRED,
      updatedAt: new Date(),
    });
  }

  isTerminal(): boolean {
    return this.status !== PlanUpgradeOrderStatus.PENDING;
  }
}
