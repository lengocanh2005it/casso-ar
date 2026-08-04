export interface PaymentAllocationData {
  id: string;
  organizationId: string;
  paymentId: string;
  receivableId: string;
  allocatedAmount: number;
  allocatedAt: Date;
  allocatedByUserId: string | null;
  deletedAt: Date | null;
  deletedByUserId: string | null;
  undoReason: string | null;
  createdAt: Date;
}

export class PaymentAllocation implements PaymentAllocationData {
  readonly id: string;
  readonly organizationId: string;
  readonly paymentId: string;
  readonly receivableId: string;
  readonly allocatedAmount: number;
  readonly allocatedAt: Date;
  readonly allocatedByUserId: string | null;
  readonly deletedAt: Date | null;
  readonly deletedByUserId: string | null;
  readonly undoReason: string | null;
  readonly createdAt: Date;

  constructor(props: PaymentAllocationData) {
    Object.assign(this, props);
  }

  isActive(): boolean {
    return this.deletedAt === null;
  }

  undo(deletedByUserId: string, undoReason: string): PaymentAllocation {
    if (!this.isActive())
      throw new Error('Payment allocation is already undone');
    return new PaymentAllocation({
      ...this,
      deletedAt: new Date(),
      deletedByUserId,
      undoReason,
    });
  }
}
