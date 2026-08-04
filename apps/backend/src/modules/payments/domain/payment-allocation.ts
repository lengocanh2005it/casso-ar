export interface PaymentAllocationProps {
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

export class PaymentAllocation {
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

  constructor(props: PaymentAllocationProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.paymentId = props.paymentId;
    this.receivableId = props.receivableId;
    this.allocatedAmount = props.allocatedAmount;
    this.allocatedAt = props.allocatedAt;
    this.allocatedByUserId = props.allocatedByUserId;
    this.deletedAt = props.deletedAt;
    this.deletedByUserId = props.deletedByUserId;
    this.undoReason = props.undoReason;
    this.createdAt = props.createdAt;
  }

  isActive(): boolean {
    return this.deletedAt === null;
  }

  undo(deletedByUserId: string, undoReason: string): PaymentAllocation {
    if (!this.isActive()) {
      throw new Error('Payment allocation is already undone');
    }
    return new PaymentAllocation({
      ...this,
      deletedAt: new Date(),
      deletedByUserId,
      undoReason,
    });
  }
}
