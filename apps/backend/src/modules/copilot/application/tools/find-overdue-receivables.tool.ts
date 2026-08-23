import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../../common/errors/app-error';
import { ErrorCode } from '../../../../common/errors/error-code';
import { TenantContextService } from '../../../../common/tenancy/tenant-context';
import type { ICustomerRepository } from '../../../customers/application/customer-repository.port';
import { CUSTOMER_REPOSITORY } from '../../../customers/application/customer-repository.port';
import type { IInvoiceRepository } from '../../../invoices/application/invoice-repository.port';
import { INVOICE_REPOSITORY } from '../../../invoices/application/invoice-repository.port';
import { Role } from '../../../organizations/domain/membership';
import type { IReceivableRepository } from '../../../receivables/application/receivable-repository.port';
import { RECEIVABLE_REPOSITORY } from '../../../receivables/application/receivable-repository.port';
import type { CopilotJsonSchema } from '../copilot-tool-registry';

export const FIND_OVERDUE_RECEIVABLES_SCHEMA: CopilotJsonSchema = {
  type: 'object',
  properties: {
    search: {
      type: 'string',
      description:
        'Optional case-insensitive search term matching customer name or invoice number.',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 20,
      description:
        'Maximum number of overdue receivables to return (default 20, max 20).',
    },
  },
  required: [],
};

export interface FindOverdueReceivablesInput {
  search?: string;
  limit?: number;
}

export interface OverdueReceivableCandidate {
  receivableId: string;
  customerName: string;
  invoiceNumber: string | null;
  remainingAmount: number;
  dueDate: string;
}

export interface FindOverdueReceivablesResult {
  items: OverdueReceivableCandidate[];
}

@Injectable()
export class FindOverdueReceivablesTool {
  static readonly NAME = 'findOverdueReceivables';

  constructor(
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
    @Inject(INVOICE_REPOSITORY)
    private readonly invoiceRepo: IInvoiceRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    input: FindOverdueReceivablesInput,
    now = new Date(),
  ): Promise<FindOverdueReceivablesResult> {
    if (input.limit !== undefined) {
      if (
        typeof input.limit !== 'number' ||
        !Number.isInteger(input.limit) ||
        input.limit < 1 ||
        input.limit > 20
      ) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          'Limit must be an integer between 1 and 20.',
        );
      }
    }

    const organizationId = this.tenantContext.getOrganizationId();
    const currentUser = this.tenantContext.getCurrentUser();
    const salesRepresentativeId =
      currentUser?.role === Role.SALES_REP ? currentUser.userId : undefined;

    const limit = input.limit ?? 20;

    let customerIdIn: string[] | undefined;
    let invoiceIdIn: string[] | undefined;

    const normalizedSearch = input.search?.trim();
    if (normalizedSearch && normalizedSearch.length > 0) {
      const [matchedCustomerIds, matchedInvoiceIds] = await Promise.all([
        this.customerRepo.findIdsBySearch(organizationId, normalizedSearch),
        this.invoiceRepo.findIdsByInvoiceNumberSearch(
          organizationId,
          normalizedSearch,
        ),
      ]);

      if (matchedCustomerIds.length === 0 && matchedInvoiceIds.length === 0) {
        return { items: [] };
      }

      customerIdIn = matchedCustomerIds;
      invoiceIdIn = matchedInvoiceIds;
    }

    const receivables = await this.receivableRepo.findOverdueCandidates({
      organizationId,
      referenceDate: now,
      salesRepresentativeId,
      customerIdIn,
      invoiceIdIn,
      limit,
    });

    if (receivables.length === 0) {
      return { items: [] };
    }

    const uniqueCustomerIds = [
      ...new Set(receivables.map((r) => r.customerId)),
    ];
    const uniqueInvoiceIds = [
      ...new Set(
        receivables
          .map((r) => r.invoiceId)
          .filter((id): id is string => id !== null),
      ),
    ];

    const [customersMap, invoicesMap] = await Promise.all([
      uniqueCustomerIds.length > 0
        ? this.customerRepo.findByIds(uniqueCustomerIds)
        : Promise.resolve(new Map()),
      uniqueInvoiceIds.length > 0
        ? this.invoiceRepo.findByIds(uniqueInvoiceIds)
        : Promise.resolve(new Map()),
    ]);

    const items: OverdueReceivableCandidate[] = receivables.map(
      (receivable) => {
        const customer = customersMap.get(receivable.customerId);
        const customerName = customer?.name || 'Khách hàng không xác định';
        const invoice = receivable.invoiceId
          ? invoicesMap.get(receivable.invoiceId)
          : undefined;
        const invoiceNumber = invoice?.invoiceNumber ?? null;

        return {
          receivableId: receivable.id,
          customerName,
          invoiceNumber,
          remainingAmount: receivable.remainingAmount,
          dueDate: receivable.dueDate.toISOString(),
        };
      },
    );

    return { items };
  }
}
