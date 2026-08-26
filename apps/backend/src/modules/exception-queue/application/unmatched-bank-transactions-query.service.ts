import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  CUSTOMER_REPOSITORY,
  type ICustomerRepository,
} from '../../customers/application/customer-repository.port';
import {
  type IInvoiceRepository,
  INVOICE_REPOSITORY,
} from '../../invoices/application/invoice-repository.port';
import {
  type IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../receivables/application/receivable-repository.port';
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
  topCandidate: MatchingCandidateView | null;
}

export interface MatchingCandidateView {
  candidate: MatchingCandidate;
  invoiceNumber: string | null;
  customerName: string | null;
  remainingAmount: number | null;
  dueDate: Date | null;
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
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
    @Inject(INVOICE_REPOSITORY)
    private readonly invoiceRepo: IInvoiceRepository,
  ) {}

  async execute(
    page = 1,
    limit = 20,
    search?: string,
  ): Promise<UnmatchedBankTransactionPage> {
    const [pageTransactions, total] = await Promise.all([
      this.bankTransactionRepo.findManyByStatus('PENDING_REVIEW', {
        skip: (page - 1) * limit,
        take: limit,
        ...(search ? { search } : {}),
      }),
      this.bankTransactionRepo.countByStatus('PENDING_REVIEW', search),
    ]);
    const topCandidates =
      await this.matchingCandidateRepo.findTopByBankTransactionIds(
        pageTransactions.map((transaction) => transaction.id),
      );
    const candidateViews = await this.toCandidateViews([
      ...topCandidates.values(),
    ]);
    const candidateViewsById = new Map(
      candidateViews.map((view) => [view.candidate.id, view]),
    );
    return {
      items: pageTransactions.map((transaction) => {
        const candidate = topCandidates.get(transaction.id);
        return {
          transaction,
          topCandidate: candidate
            ? (candidateViewsById.get(candidate.id) ?? null)
            : null,
        };
      }),
      total,
      page,
      limit,
    };
  }

  async countPendingReview(): Promise<number> {
    return this.bankTransactionRepo.countByStatus('PENDING_REVIEW');
  }

  async candidates(
    bankTransactionId: string,
  ): Promise<MatchingCandidateView[]> {
    const transaction =
      await this.bankTransactionRepo.findById(bankTransactionId);
    if (!transaction) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy giao dịch ngân hàng.',
      );
    }
    return this.toCandidateViews(
      await this.matchingCandidateRepo.findByBankTransactionId(
        bankTransactionId,
      ),
    );
  }

  private async toCandidateViews(
    candidates: MatchingCandidate[],
  ): Promise<MatchingCandidateView[]> {
    if (candidates.length === 0) return [];
    const receivables = await this.receivableRepo.findByIds([
      ...new Set(candidates.map((candidate) => candidate.receivableId)),
    ]);
    const customerIds = [
      ...new Set(candidates.map((candidate) => candidate.customerId)),
    ];
    const invoiceIds = [
      ...new Set(
        [...receivables.values()].flatMap((receivable) =>
          receivable.invoiceId ? [receivable.invoiceId] : [],
        ),
      ),
    ];
    const [customers, invoices] = await Promise.all([
      this.customerRepo.findByIds(customerIds),
      this.invoiceRepo.findByIds(invoiceIds),
    ]);

    return candidates.map((candidate) => {
      const receivable = receivables.get(candidate.receivableId);
      return {
        candidate,
        invoiceNumber: receivable?.invoiceId
          ? (invoices.get(receivable.invoiceId)?.invoiceNumber ?? null)
          : null,
        customerName: customers.get(candidate.customerId)?.name ?? null,
        remainingAmount: receivable
          ? receivable.originalAmount - receivable.paidAmount
          : null,
        dueDate: receivable?.dueDate ?? null,
      };
    });
  }
}
