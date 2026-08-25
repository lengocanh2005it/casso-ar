import { PeriodChargeStatus, PlanId } from '@casso-ar/shared-types';

export interface PeriodChargeProps {
  id: string;
  orderCode: number;
  organizationId: string;
  planId: PlanId;
  periodStart: Date;
  periodEnd: Date;
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

  markFailed(): PeriodCharge {
    return new PeriodCharge({
      ...this,
      status: PeriodChargeStatus.FAILED,
      updatedAt: new Date(),
    });
  }

  isTerminal(): boolean {
    return this.status !== PeriodChargeStatus.PENDING;
  }
}
