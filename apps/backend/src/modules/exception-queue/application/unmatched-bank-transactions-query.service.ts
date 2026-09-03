import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { maskAccountNumber } from '../../bank-accounts/application/account-number-normalizer';
import {
  CUSTOMER_BANK_ACCOUNT_REPOSITORY,
  type ICustomerBankAccountRepository,
} from '../../bank-accounts/application/customer-bank-account-repository.port';
import {
  CUSTOMER_REPOSITORY,
  type ICustomerRepository,
} from '../../customers/application/customer-repository.port';
import {
  type IInvoiceRepository,
  INVOICE_REPOSITORY,
} from '../../invoices/application/invoice-repository.port';
import { loadReceivableRelatedData } from '../../receivables/application/load-receivable-related-data';
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
import type { AiMatchingRecommendation } from '../../webhooks/domain/ai-matching-recommendation';
import type { BankTransaction } from '../../webhooks/domain/bank-transaction';
import type { MatchingCandidate } from '../../webhooks/domain/matching-candidate';

export interface AiMatchingRecommendationView {
  status: AiMatchingRecommendation['status'];
  recommendedReceivableId: string | null;
  confidence: number | null;
  reason: string | null;
  isCurrent: boolean;
}

export interface PayerView {
  accountNumberMasked: string;
  name: string;
  linkedCustomers: { customerId: string; customerName: string }[];
}

export interface UnmatchedBankTransactionView {
  transaction: BankTransaction;
  topCandidate: MatchingCandidateView | null;
  aiRecommendation: AiMatchingRecommendationView | null;
  payer: PayerView;
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
    @Inject(CUSTOMER_BANK_ACCOUNT_REPOSITORY)
    private readonly bankAccountRepo: Pick<
      ICustomerBankAccountRepository,
      'findActiveByAccountNumber'
    > = { findActiveByAccountNumber: async () => [] },
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
    const recommendationIds = pageTransactions.flatMap((transaction) => {
      const recommendation = transaction.aiRecommendation;
      return recommendation?.status === 'SUCCEEDED' &&
        recommendation.recommendedReceivableId
        ? [recommendation.recommendedReceivableId]
        : [];
    });
    const openReceivableIds = new Set(
      recommendationIds.length > 0
        ? (
            await this.receivableRepo.findOpenByIds([
              ...new Set(recommendationIds),
            ])
          ).map((receivable) => receivable.id)
        : [],
    );

    const linksByAccount = new Map<string, { customerId: string }[]>();
    await Promise.all(
      [
        ...new Set(
          pageTransactions
            .map((t) => t.counterpartyAccountNumber)
            .filter((n): n is string => Boolean(n)),
        ),
      ].map(async (accountNumber) => {
        linksByAccount.set(
          accountNumber,
          await this.bankAccountRepo.findActiveByAccountNumber(accountNumber),
        );
      }),
    );
    const payerCustomerIds = [
      ...new Set(
        [...linksByAccount.values()].flat().map((link) => link.customerId),
      ),
    ];
    const payerCustomerNames =
      payerCustomerIds.length > 0
        ? await this.customerRepo.findByIds(payerCustomerIds)
        : new Map<string, { name: string }>();

    return {
      items: pageTransactions.map((transaction) => {
        const candidate = topCandidates.get(transaction.id);
        const accountNumber = transaction.counterpartyAccountNumber;
        const links = accountNumber
          ? (linksByAccount.get(accountNumber) ?? [])
          : [];
        return {
          transaction,
          topCandidate: candidate
            ? (candidateViewsById.get(candidate.id) ?? null)
            : null,
          aiRecommendation: toRecommendationView(
            transaction.aiRecommendation,
            openReceivableIds,
          ),
          payer: {
            accountNumberMasked: accountNumber
              ? maskAccountNumber(accountNumber)
              : '',
            name: transaction.counterpartyName ?? '',
            linkedCustomers: links.map((link) => ({
              customerId: link.customerId,
              customerName: payerCustomerNames.get(link.customerId)?.name ?? '',
            })),
          },
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
    const { customers, invoices } = await loadReceivableRelatedData(
      [...receivables.values()],
      candidates.map((candidate) => candidate.customerId),
      this.customerRepo,
      this.invoiceRepo,
    );

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

function toRecommendationView(
  recommendation: AiMatchingRecommendation | null | undefined,
  openReceivableIds: Set<string>,
): AiMatchingRecommendationView | null {
  if (!recommendation) return null;
  return {
    status: recommendation.status,
    recommendedReceivableId: recommendation.recommendedReceivableId,
    confidence: recommendation.confidence,
    reason: recommendation.reason,
    isCurrent:
      recommendation.status === 'SUCCEEDED' &&
      recommendation.recommendedReceivableId !== null &&
      openReceivableIds.has(recommendation.recommendedReceivableId),
  };
}
