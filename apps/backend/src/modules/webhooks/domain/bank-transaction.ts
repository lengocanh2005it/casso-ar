export type BankTransactionStatus =
  | 'UNMATCHED'
  | 'PENDING_REVIEW'
  | 'MATCHED'
  | 'IGNORED';

export interface BankTransactionProps {
  id: string;
  organizationId: string;
  bankConnectionId: string;
  webhookInboxId: string;
  providerTransactionId: string;
  amount: number;
  transactionDateTime: Date;
  counterpartyAccountNumber: string;
  counterpartyName: string;
  transferContent: string;
  status: BankTransactionStatus;
  version: number;
  createdAt: Date;
}

export class BankTransaction {
  readonly id: string;
  readonly organizationId: string;
  readonly bankConnectionId: string;
  readonly webhookInboxId: string;
  readonly providerTransactionId: string;
  readonly amount: number;
  readonly transactionDateTime: Date;
  readonly counterpartyAccountNumber: string;
  readonly counterpartyName: string;
  readonly transferContent: string;
  readonly status: BankTransactionStatus;
  readonly version: number;
  readonly createdAt: Date;

  constructor(props: BankTransactionProps) {
    Object.assign(this, props);
  }
  isRefund(): boolean {
    return this.amount < 0;
  }
  markMatched(): BankTransaction {
    return new BankTransaction({ ...this, status: 'MATCHED' });
  }
  markPendingReview(): BankTransaction {
    return new BankTransaction({ ...this, status: 'PENDING_REVIEW' });
  }
  markUnmatched(): BankTransaction {
    return new BankTransaction({ ...this, status: 'UNMATCHED' });
  }
  markIgnored(): BankTransaction {
    return new BankTransaction({ ...this, status: 'IGNORED' });
  }
}
