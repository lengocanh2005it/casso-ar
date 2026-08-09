import type {
  BankTransaction,
  MatchingCandidate,
} from '@/features/transactions/types';

export interface PendingReviewItem {
  transaction: BankTransaction;
  topCandidate: MatchingCandidate | null;
}
