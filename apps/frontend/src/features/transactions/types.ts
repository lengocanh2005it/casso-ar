export type BankTransactionStatus =
  | 'UNMATCHED'
  | 'PENDING_REVIEW'
  | 'MATCHED'
  | 'IGNORED'
  | 'PREPAID';

export interface BankTransaction {
  id: string;
  providerTransactionId: string;
  amount: number;
  transactionDateTime: string;
  counterpartyAccountNumber: string | null;
  counterpartyName: string | null;
  transferContent: string | null;
  status: BankTransactionStatus;
  version: number;
  createdAt: string;
}

export interface MatchingCandidate {
  id: string;
  receivableId: string;
  customerId: string;
  referenceCodeScore: number;
  amountScore: number;
  customerBankAccountScore: number;
  payerNameScore: number;
  timingScore: number;
  totalScore: number;
  createdAt: string;
}
