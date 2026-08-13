import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  CUSTOMER_REPOSITORY,
  type ICustomerRepository,
} from '../../customers/application/customer-repository.port';
import {
  DISPUTE_REPOSITORY,
  type IDisputeRepository,
} from '../../disputes/application/dispute-repository.port';
import {
  type IInvoiceRepository,
  INVOICE_REPOSITORY,
} from '../../invoices/application/invoice-repository.port';
import { Role } from '../../organizations/domain/membership';
import type { ReceivableListFilters } from '../application/receivable-repository.port';
import {
  type IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../application/receivable-repository.port';
import type { Receivable } from '../domain/receivable';

// Caps the id-fan-out for a search term so an org with a huge customer/
// invoice base can't produce an unbounded IN clause on the receivables query.
const SEARCH_ID_LIMIT = 500;

export interface ReceivableListItem {
  receivable: Receivable;
  isOverdue: boolean;
  isDisputed: boolean;
  disputeId: string | null;
  invoiceNumber: string | null;
  customerName: string | null;
}

@Injectable()
export class ListReceivablesUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    @Inject(DISPUTE_REPOSITORY)
    private readonly disputeRepo: IDisputeRepository,
    @Inject(INVOICE_REPOSITORY)
    private readonly invoiceRepo: IInvoiceRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: {
    filters: ReceivableListFilters;
    search?: string;
    page: number;
    limit: number;
  }): Promise<{
    items: ReceivableListItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const orgId = this.tenantContext.getOrganizationId();
    const user = this.tenantContext.getCurrentUser();

    const filters = { ...input.filters };

    // SALES_REP role: auto-scope to own receivables
    if (user?.role === Role.SALES_REP) {
      filters.salesRepresentativeId = user.userId;
    }

    if (input.search) {
      const [customerIdIn, invoiceIdIn] = await Promise.all([
        this.customerRepo.findIdsBySearch(orgId, input.search, SEARCH_ID_LIMIT),
        this.invoiceRepo.findIdsByInvoiceNumberSearch(
          orgId,
          input.search,
          SEARCH_ID_LIMIT,
        ),
      ]);
      filters.customerIdIn = customerIdIn;
      filters.invoiceIdIn = invoiceIdIn;
    }

    const [receivables, total] = await Promise.all([
      this.receivableRepo.findPage(orgId, filters, input.page, input.limit),
      this.receivableRepo.count(orgId, filters),
    ]);

    const receivableIds = receivables.map((r) => r.id);
    const invoiceIds = [
      ...new Set(
        receivables.flatMap((r) => (r.invoiceId ? [r.invoiceId] : [])),
      ),
    ];
    const customerIds = [...new Set(receivables.map((r) => r.customerId))];

    const [openDisputes, invoices, customers] = await Promise.all([
      this.disputeRepo.findOpenDisputesByReceivableIds(receivableIds),
      this.invoiceRepo.findByIds(invoiceIds),
      this.customerRepo.findByIds(customerIds),
    ]);

    const now = new Date();
    const items = receivables.map((r) => {
      const isOverdue = r.isOverdue(now);
      const disputeId = openDisputes.get(r.id) ?? null;
      const invoiceNumber = r.invoiceId
        ? (invoices.get(r.invoiceId)?.invoiceNumber ?? null)
        : null;
      const customerName = customers.get(r.customerId)?.name ?? null;
      return {
        receivable: r,
        isOverdue,
        isDisputed: disputeId !== null,
        disputeId,
        invoiceNumber,
        customerName,
      };
    });

    return { items, total, page: input.page, limit: input.limit };
  }
}
