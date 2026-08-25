import { ReceivableStatus } from '@casso-ar/shared-types';

export interface ReceivableProps {
  id: string;
  organizationId: string;
  customerId: string;
  invoiceId: string | null;
  originalAmount: number;
  paidAmount: number;
  dueDate: Date;
  status: ReceivableStatus;
  salesRepresentativeId: string | null;
  createdAt: Date;
  closedAt: Date | null;
  version: number;
}

const OPEN_STATUSES = [ReceivableStatus.OPEN, ReceivableStatus.PARTIALLY_PAID];

export class Receivable {
  readonly id: string;
  readonly organizationId: string;
  readonly customerId: string;
  readonly invoiceId: string | null;
  readonly originalAmount: number;
  readonly paidAmount: number;
  readonly dueDate: Date;
  readonly status: ReceivableStatus;
  readonly salesRepresentativeId: string | null;
  readonly createdAt: Date;
  readonly closedAt: Date | null;
  readonly version: number;

  constructor(props: ReceivableProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.customerId = props.customerId;
    this.invoiceId = props.invoiceId;
    this.originalAmount = props.originalAmount;
    this.paidAmount = props.paidAmount;
    this.dueDate = props.dueDate;
    this.status = props.status;
    this.salesRepresentativeId = props.salesRepresentativeId;
    this.createdAt = props.createdAt;
    this.closedAt = props.closedAt;
    this.version = props.version;
  }

  get remainingAmount(): number {
    return this.originalAmount - this.paidAmount;
  }

  isOverdue(today: Date): boolean {
    return (
      OPEN_STATUSES.includes(this.status) &&
      this.dueDate.getTime() < today.getTime()
    );
  }

  private withProps(overrides: Partial<ReceivableProps>): Receivable {
    return new Receivable({ ...this, ...overrides });
  }

  applyPaymentAllocation(amount: number): Receivable {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('Allocation amount must be a positive integer');
    }
    if (!OPEN_STATUSES.includes(this.status)) {
      throw new Error(
        `Cannot allocate payment to a receivable in status ${this.status}`,
      );
    }
    if (amount > this.remainingAmount) {
      throw new Error('Allocation amount exceeds remaining amount');
    }

    const newPaidAmount = this.paidAmount + amount;
    const newRemaining = this.originalAmount - newPaidAmount;
    const newStatus =
      newRemaining === 0
        ? ReceivableStatus.PAID
        : ReceivableStatus.PARTIALLY_PAID;

    return this.withProps({
      paidAmount: newPaidAmount,
      status: newStatus,
      closedAt: newStatus === ReceivableStatus.PAID ? new Date() : null,
    });
  }

  removePaymentAllocation(amount: number): Receivable {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('Allocation amount must be a positive integer');
    }
    if (
      [ReceivableStatus.CANCELLED, ReceivableStatus.WRITTEN_OFF].includes(
        this.status,
      )
    ) {
      throw new Error(
        `Cannot undo an allocation for a receivable in status ${this.status}`,
      );
    }
    if (amount > this.paidAmount) {
      throw new Error('Allocation amount exceeds paid amount');
    }

    const newPaidAmount = this.paidAmount - amount;
    return this.withProps({
      paidAmount: newPaidAmount,
      status:
        newPaidAmount === 0
          ? ReceivableStatus.OPEN
          : ReceivableStatus.PARTIALLY_PAID,
      closedAt: null,
    });
  }

  writeOff(): Receivable {
    if (!OPEN_STATUSES.includes(this.status)) {
      throw new Error(`Cannot write off a receivable in status ${this.status}`);
    }
    return this.withProps({
      status: ReceivableStatus.WRITTEN_OFF,
      closedAt: new Date(),
    });
  }

  cancel(): Receivable {
    if (!OPEN_STATUSES.includes(this.status)) {
      throw new Error(`Cannot cancel a receivable in status ${this.status}`);
    }
    if (this.paidAmount > 0) {
      throw new Error('Cannot cancel a receivable that has received payment');
    }
    return this.withProps({
      status: ReceivableStatus.CANCELLED,
      closedAt: new Date(),
    });
  }
}
