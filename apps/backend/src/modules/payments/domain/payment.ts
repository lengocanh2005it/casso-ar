export interface PaymentProps {
  id: string;
  organizationId: string;
  customerId: string | null;
  bankTransactionId: string | null;
  totalAmount: number;
  allocatedAmount: number;
  payerName: string;
  receivedAt: Date;
  createdAt: Date;
}

export class Payment {
  readonly id: string;
  readonly organizationId: string;
  readonly customerId: string | null;
  readonly bankTransactionId: string | null;
  readonly totalAmount: number;
  readonly allocatedAmount: number;
  readonly payerName: string;
  readonly receivedAt: Date;
  readonly createdAt: Date;

  constructor(props: PaymentProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.customerId = props.customerId;
    this.bankTransactionId = props.bankTransactionId;
    this.totalAmount = props.totalAmount;
    this.allocatedAmount = props.allocatedAmount;
    this.payerName = props.payerName;
    this.receivedAt = props.receivedAt;
    this.createdAt = props.createdAt;
  }

  get unallocatedAmount(): number {
    return this.totalAmount - this.allocatedAmount;
  }

  withAdditionalAllocation(amount: number): Payment {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('Allocation amount must be a positive integer');
    }
    if (amount > this.unallocatedAmount) {
      throw new Error('Allocation amount exceeds unallocated payment amount');
    }
    return new Payment({
      ...this,
      allocatedAmount: this.allocatedAmount + amount,
    });
  }

  withRemovedAllocation(amount: number): Payment {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('Allocation amount must be a positive integer');
    }
    if (amount > this.allocatedAmount) {
      throw new Error('Allocation amount exceeds allocated payment amount');
    }
    return new Payment({
      ...this,
      allocatedAmount: this.allocatedAmount - amount,
    });
  }
}
