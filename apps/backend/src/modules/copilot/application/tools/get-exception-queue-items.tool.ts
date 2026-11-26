import { Injectable } from '@nestjs/common';
import { AppError } from '../../../../common/errors/app-error';
import { ErrorCode } from '../../../../common/errors/error-code';
import { TenantContextService } from '../../../../common/tenancy/tenant-context';
import { MAX_SEARCH_LENGTH } from '../../../../common/validation/search-length';
import type { UnmatchedBankTransactionPage } from '../../../exception-queue/application/unmatched-bank-transactions-query.service';
import { UnmatchedBankTransactionsQueryService } from '../../../exception-queue/application/unmatched-bank-transactions-query.service';
import {
  ACTIONABLE_BANK_TRANSACTION_STATUSES,
  type BankTransactionStatus,
} from '../../../webhooks/domain/bank-transaction';
import type { CopilotJsonSchema } from '../copilot-tool-registry';
import { MAX_SEARCH_LIMIT, validateSearchAndLimit } from './copilot-tool-input';

export const GET_EXCEPTION_QUEUE_ITEMS_SCHEMA: CopilotJsonSchema = {
  type: 'object',
  properties: {
    page: {
      type: 'integer',
      minimum: 1,
      description: '1-based page of the Exception Queue (default 1).',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: MAX_SEARCH_LIMIT,
      default: 10,
      description:
        'Maximum number of transfers to return (default 10, max 10).',
    },
    search: {
      type: 'string',
      maxLength: MAX_SEARCH_LENGTH,
      description:
        'Optional case-insensitive search term matching the transfer content or payer.',
    },
    status: {
      type: 'string',
      enum: [...ACTIONABLE_BANK_TRANSACTION_STATUSES],
      description:
        'Optional actionable status filter: PENDING_REVIEW (candidates need a human choice) or UNMATCHED (no matching candidate). Defaults to both.',
    },
  },
  required: [],
};

export interface GetExceptionQueueItemsInput {
  page?: unknown;
  limit?: unknown;
  search?: unknown;
  status?: unknown;
}

export interface ExceptionQueueCandidateSummary {
  customerName: string | null;
  invoiceNumber: string | null;
  remainingAmount: number | null;
}

export interface ExceptionQueueItem {
  /** Routing metadata for Copilot only — never display this to the user. */
  bankTransactionId: string;
  amount: number;
  date: string;
  transferContent: string;
  status: BankTransactionStatus;
  isAmbiguousMatch: boolean;
  hasMatchingCandidate: boolean;
  candidate: ExceptionQueueCandidateSummary | null;
  aiMatchingRecommendationReason: string | null;
  payerName: string;
  payerLinkedCustomers: string[];
}

export interface GetExceptionQueueItemsResult {
  items: ExceptionQueueItem[];
  page: number;
  hasMore: boolean;
}

function validatePage(value: unknown): number {
  if (value === undefined) return 1;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Tham số page phải là số nguyên từ 1 trở lên.',
    );
  }
  return value;
}

function validateStatus(
  value: unknown,
): (typeof ACTIONABLE_BANK_TRANSACTION_STATUSES)[number] | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'string' ||
    !ACTIONABLE_BANK_TRANSACTION_STATUSES.includes(
      value as (typeof ACTIONABLE_BANK_TRANSACTION_STATUSES)[number],
    )
  ) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Tham số status chỉ nhận ${ACTIONABLE_BANK_TRANSACTION_STATUSES.join(' hoặc ')}.`,
    );
  }
  return value as (typeof ACTIONABLE_BANK_TRANSACTION_STATUSES)[number];
}

@Injectable()
export class GetExceptionQueueItemsTool {
  static readonly NAME = 'getExceptionQueueItems';

  constructor(
    private readonly queryService: UnmatchedBankTransactionsQueryService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    input: GetExceptionQueueItemsInput,
  ): Promise<GetExceptionQueueItemsResult> {
    const { search: validatedSearch, limit: validatedLimit } =
      validateSearchAndLimit(input);
    const page = validatePage(input.page);
    const status = validateStatus(input.status);
    if (
      validatedSearch !== undefined &&
      validatedSearch.length > MAX_SEARCH_LENGTH
    ) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        `Tham số search không được vượt quá ${MAX_SEARCH_LENGTH} ký tự.`,
      );
    }
    const search = validatedSearch?.trim() || undefined;
    const limit = validatedLimit ?? 10;
    // Reached only inside a request; the queue repositories scope every query
    // by this same organization, so a missing tenant must fail before them.
    this.tenantContext.getOrganizationId();

    const result = await this.queryService.execute(page, limit, search, status);
    return this.toResult(result);
  }

  private toResult(
    result: UnmatchedBankTransactionPage,
  ): GetExceptionQueueItemsResult {
    return {
      items: result.items.map((view) => ({
        bankTransactionId: view.transaction.id,
        amount: view.transaction.amount,
        date: view.transaction.transactionDateTime.toISOString(),
        transferContent: view.transaction.transferContent,
        status: view.transaction.status,
        isAmbiguousMatch: view.isAmbiguous,
        hasMatchingCandidate: view.topCandidate !== null,
        candidate: view.topCandidate
          ? {
              customerName: view.topCandidate.customerName,
              invoiceNumber: view.topCandidate.invoiceNumber,
              remainingAmount: view.topCandidate.remainingAmount,
            }
          : null,
        aiMatchingRecommendationReason:
          view.aiRecommendation?.status === 'SUCCEEDED' &&
          view.aiRecommendation.isCurrent
            ? (view.aiRecommendation.reason ?? null)
            : null,
        payerName: view.payer.name,
        payerLinkedCustomers: view.payer.linkedCustomers.map(
          (customer) => customer.customerName,
        ),
      })),
      page: result.page,
      hasMore: result.page * result.limit < result.total,
    };
  }
}
