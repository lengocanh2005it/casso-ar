import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../../common/errors/app-error';
import { ErrorCode } from '../../../../common/errors/error-code';
import { TenantContextService } from '../../../../common/tenancy/tenant-context';
import { MAX_SEARCH_LENGTH } from '../../../../common/validation/search-length';
import {
  CUSTOMER_REPOSITORY,
  type ICustomerRepository,
} from '../../../customers/application/customer-repository.port';
import {
  type ReceivableCombinationSuggestionsView,
  UnmatchedBankTransactionsQueryService,
} from '../../../exception-queue/application/unmatched-bank-transactions-query.service';
import {
  type IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../../receivables/application/receivable-repository.port';
import type { CopilotJsonSchema } from '../copilot-tool-registry';

export const GET_RECEIVABLE_COMBINATION_SUGGESTIONS_SCHEMA: CopilotJsonSchema =
  {
    type: 'object',
    properties: {
      bankTransactionId: {
        type: 'string',
        description:
          'Internal id of one actionable transfer in the Exception Queue.',
      },
      customerName: {
        type: 'string',
        maxLength: MAX_SEARCH_LENGTH,
        description:
          'Exact customer name, needed only when the transfer customer cannot be determined.',
      },
    },
    required: ['bankTransactionId'],
  };

export interface GetReceivableCombinationSuggestionsInput {
  bankTransactionId?: unknown;
  customerName?: unknown;
}

export interface ExactSumReceivable {
  invoiceNumber: string | null;
  faceAmount: number;
  remainingAmount: number;
}

export interface ExactSumReceivableGroup {
  receivables: ExactSumReceivable[];
}

export interface GetReceivableCombinationSuggestionsResult {
  status: 'complete' | 'incomplete' | 'customer_required' | 'unavailable';
  groups: ExactSumReceivableGroup[];
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Thiếu tham số ${field} trong lời gọi tool Copilot.`,
    );
  }
  return value.trim();
}

@Injectable()
export class GetReceivableCombinationSuggestionsTool {
  static readonly NAME = 'getReceivableCombinationSuggestions';

  constructor(
    private readonly queryService: UnmatchedBankTransactionsQueryService,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    input: GetReceivableCombinationSuggestionsInput,
  ): Promise<GetReceivableCombinationSuggestionsResult> {
    const bankTransactionId = requiredString(
      input.bankTransactionId,
      'bankTransactionId',
    );
    let customerName: string | undefined;
    if (input.customerName !== undefined) {
      if (
        typeof input.customerName !== 'string' ||
        input.customerName.length > MAX_SEARCH_LENGTH
      ) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          `Tham số customerName không được vượt quá ${MAX_SEARCH_LENGTH} ký tự.`,
        );
      }
      customerName = input.customerName.trim() || undefined;
    }
    const organizationId = this.tenantContext.getOrganizationId();

    let view: ReceivableCombinationSuggestionsView;
    try {
      view = await this.queryService.combinationSuggestions(bankTransactionId);
    } catch (error) {
      if (error instanceof AppError) {
        return { status: 'unavailable', groups: [] };
      }
      throw error;
    }

    if (view.status === 'CUSTOMER_REQUIRED' && customerName) {
      const customerId = await this.resolveCustomerId(
        organizationId,
        customerName,
      );
      if (!customerId) {
        return { status: 'customer_required', groups: [] };
      }
      try {
        view = await this.queryService.combinationSuggestions(
          bankTransactionId,
          customerId,
        );
      } catch (error) {
        if (error instanceof AppError) {
          return { status: 'unavailable', groups: [] };
        }
        throw error;
      }
    }

    if (view.status === 'CUSTOMER_REQUIRED') {
      return { status: 'customer_required', groups: [] };
    }
    if (view.status === 'INCOMPLETE') {
      return { status: 'incomplete', groups: [] };
    }
    return { status: 'complete', groups: await this.toGroups(view) };
  }

  private async resolveCustomerId(
    organizationId: string,
    customerName: string,
  ): Promise<string | null> {
    const normalized = customerName.trim().toLowerCase();
    // Limit 2: one means unique, two means ambiguous — never pick implicitly.
    const ids = await this.customerRepo.findIdsByExactName(
      organizationId,
      normalized,
      2,
    );
    return ids.length === 1 ? ids[0] : null;
  }

  private async toGroups(
    view: ReceivableCombinationSuggestionsView,
  ): Promise<ExactSumReceivableGroup[]> {
    if (view.combinations.length === 0) return [];
    const receivableIds = [
      ...new Set(
        view.combinations.flatMap((group) =>
          group.receivables.map((receivable) => receivable.receivableId),
        ),
      ),
    ];
    const receivables = await this.receivableRepo.findByIds(receivableIds);
    return view.combinations.map((group) => ({
      receivables: group.receivables.map((receivable) => {
        const entity = receivables.get(receivable.receivableId);
        if (!entity) {
          throw new AppError(
            ErrorCode.INTERNAL_SERVER_ERROR,
            'Không đọc được dữ liệu khoản phải thu của nhóm đề xuất.',
          );
        }
        return {
          invoiceNumber: receivable.invoiceNumber,
          faceAmount: entity.originalAmount,
          remainingAmount: receivable.remainingAmount,
        };
      }),
    }));
  }
}
