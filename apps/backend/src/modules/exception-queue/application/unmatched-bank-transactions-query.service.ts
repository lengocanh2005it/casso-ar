import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  BANK_TRANSACTION_REPOSITORY,
  type IBankTransactionRepository,
} from '../../webhooks/application/bank-transaction-repository.port';
import {
  type IMatchingCandidateRepository,
  MATCHING_CANDIDATE_REPOSITORY,
} from '../../webhooks/application/matching-candidate-repository.port';
import type { BankTransaction } from '../../webhooks/domain/bank-transaction';
import type { MatchingCandidate } from '../../webhooks/domain/matching-candidate';

export interface UnmatchedBankTransactionView {
  transaction: BankTransaction;
  topCandidate: MatchingCandidate | null;
}

export interface UnmatchedBankTransactionPage {
  items: UnmatchedBankTransactionView[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class UnmatchedBankTransactionsQueryService {
  constructor(
    @Inject(BANK_TRANSACTION_REPOSITORY)
    private readonly bankTransactionRepo: IBankTransactionRepository,
    @Inject(MATCHING_CANDIDATE_REPOSITORY)
    private readonly matchingCandidateRepo: IMatchingCandidateRepository,
  ) {}

  async execute(page = 1, limit = 20): Promise<UnmatchedBankTransactionPage> {
    const transactions =
      await this.bankTransactionRepo.findManyByStatus('PENDING_REVIEW');
    // ponytail: in-memory paging for the MVP; switch to SQL LIMIT/OFFSET plus
    // COUNT when pending-review volume makes loading the full queue measurable.
    const pageTransactions = transactions.slice(
      (page - 1) * limit,
      page * limit,
    );
    const topCandidates =
      await this.matchingCandidateRepo.findTopByBankTransactionIds(
        pageTransactions.map((transaction) => transaction.id),
      );
    return {
      items: pageTransactions.map((transaction) => ({
        transaction,
        topCandidate: topCandidates.get(transaction.id) ?? null,
      })),
      total: transactions.length,
      page,
      limit,
    };
  }

  async countPendingReview(): Promise<number> {
    return this.bankTransactionRepo.countByStatus('PENDING_REVIEW');
  }

  async candidates(bankTransactionId: string): Promise<MatchingCandidate[]> {
    const transaction =
      await this.bankTransactionRepo.findById(bankTransactionId);
    if (!transaction) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy giao dịch ngân hàng.',
      );
    }
    return this.matchingCandidateRepo.findByBankTransactionId(
      bankTransactionId,
    );
  }
}
