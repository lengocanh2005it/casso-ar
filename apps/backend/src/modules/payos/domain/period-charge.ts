import { PeriodChargeStatus, PlanId } from '@casso-ar/shared-types';

export interface PeriodChargeProps {
  id: string;
  orderCode: number;
  organizationId: string;
  planId: PlanId;
  periodStart: Date;
  periodEnd: Date;
  quotedAmount: number | null;
  payosPaymentLinkId: string | null;
  status: PeriodChargeStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class PeriodCharge {
  readonly id: string;
  readonly orderCode: number;
  readonly organizationId: string;
  readonly planId: PlanId;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly quotedAmount: number | null;
  readonly payosPaymentLinkId: string | null;
  readonly status: PeriodChargeStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: PeriodChargeProps) {
    this.id = props.id;
    this.orderCode = props.orderCode;
    this.organizationId = props.organizationId;
    this.planId = props.planId;
    this.periodStart = props.periodStart;
    this.periodEnd = props.periodEnd;
    this.quotedAmount = props.quotedAmount;
    this.payosPaymentLinkId = props.payosPaymentLinkId;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  markPaid(): PeriodCharge {
    return new PeriodCharge({
      ...this,
      status: PeriodChargeStatus.PAID,
      updatedAt: new Date(),
    });
  }

  withPayosPaymentLinkId(paymentLinkId: string): PeriodCharge {
    return new PeriodCharge({ ...this, payosPaymentLinkId: paymentLinkId });
  }

  markFailed(): PeriodCharge {
    return new PeriodCharge({
      ...this,
      status: PeriodChargeStatus.FAILED,
      updatedAt: new Date(),
    });
  }

  markReviewRequired(): PeriodCharge {
    return new PeriodCharge({
      ...this,
      status: PeriodChargeStatus.REVIEW_REQUIRED,
      updatedAt: new Date(),
    });
  }

  isTerminal(): boolean {
    return this.status !== PeriodChargeStatus.PENDING;
  }
}
