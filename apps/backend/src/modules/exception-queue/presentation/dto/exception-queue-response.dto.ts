import type { Payment } from '../../../payments/domain/payment';
import type {
  BankTransaction,
  BankTransactionStatus,
} from '../../../webhooks/domain/bank-transaction';
import type {
  MatchingCandidateView,
  UnmatchedBankTransactionPage,
  UnmatchedBankTransactionView,
} from '../../application/unmatched-bank-transactions-query.service';

export class BankTransactionResponseDto {
  id: string;
  providerTransactionId: string;
  amount: number;
  transactionDateTime: Date;
  counterpartyAccountNumber: string;
  counterpartyName: string;
  transferContent: string;
  status: BankTransactionStatus;
  createdAt: Date;
  // Exception Queue spec §1: the accountant must round-trip this value in
  // POST /bank-transactions/:id/match to prove they're acting on the
  // current row — the one documented exception to "never leak version".
  version: number;
}

export class MatchingCandidateResponseDto {
  id: string;
  receivableId: string;
  customerId: string;
  referenceCodeScore: number;
  amountScore: number;
  customerBankAccountScore: number;
  payerNameScore: number;
  timingScore: number;
  totalScore: number;
  invoiceNumber: string | null;
  customerName: string | null;
  remainingAmount: number | null;
  dueDate: Date | null;
  createdAt: Date;
}

export class PaymentResponseDto {
  id: string;
  customerId: string | null;
  bankTransactionId: string | null;
  totalAmount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  payerName: string;
  receivedAt: Date;
  createdAt: Date;
}

export class UnmatchedBankTransactionResponseDto {
  transaction: BankTransactionResponseDto;
  topCandidate: MatchingCandidateResponseDto | null;
}

export class UnmatchedBankTransactionPageResponseDto {
  items: UnmatchedBankTransactionResponseDto[];
  total: number;
  page: number;
  limit: number;
}

export function toBankTransactionResponse(
  transaction: BankTransaction,
): BankTransactionResponseDto {
  return {
    id: transaction.id,
    providerTransactionId: transaction.providerTransactionId,
    amount: transaction.amount,
    transactionDateTime: transaction.transactionDateTime,
    counterpartyAccountNumber: transaction.counterpartyAccountNumber,
    counterpartyName: transaction.counterpartyName,
    transferContent: transaction.transferContent,
    status: transaction.status,
    createdAt: transaction.createdAt,
    version: transaction.version,
  };
}

export function toMatchingCandidateResponse(
  view: MatchingCandidateView,
): MatchingCandidateResponseDto {
  const { candidate } = view;
  return {
    id: candidate.id,
    receivableId: candidate.receivableId,
    customerId: candidate.customerId,
    referenceCodeScore: candidate.referenceCodeScore,
    amountScore: candidate.amountScore,
    customerBankAccountScore: candidate.customerBankAccountScore,
    payerNameScore: candidate.payerNameScore,
    timingScore: candidate.timingScore,
    totalScore: candidate.totalScore,
    invoiceNumber: view.invoiceNumber,
    customerName: view.customerName,
    remainingAmount: view.remainingAmount,
    dueDate: view.dueDate,
    createdAt: candidate.createdAt,
  };
}

export function toPaymentResponse(payment: Payment): PaymentResponseDto {
  return {
    id: payment.id,
    customerId: payment.customerId,
    bankTransactionId: payment.bankTransactionId,
    totalAmount: payment.totalAmount,
    allocatedAmount: payment.allocatedAmount,
    unallocatedAmount: payment.unallocatedAmount,
    payerName: payment.payerName,
    receivedAt: payment.receivedAt,
    createdAt: payment.createdAt,
  };
}

export function toUnmatchedResponse(
  page: UnmatchedBankTransactionPage,
): UnmatchedBankTransactionPageResponseDto {
  return {
    ...page,
    items: page.items.map(toUnmatchedItemResponse),
  };
}

function toUnmatchedItemResponse(
  item: UnmatchedBankTransactionView,
): UnmatchedBankTransactionResponseDto {
  return {
    transaction: toBankTransactionResponse(item.transaction),
    topCandidate: item.topCandidate
      ? toMatchingCandidateResponse(item.topCandidate)
      : null,
  };
}
