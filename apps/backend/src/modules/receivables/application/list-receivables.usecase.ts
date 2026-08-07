import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { IDisputeRepository } from '../../disputes/application/dispute-repository.port';
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
import {
  type ReceivableSummaryResponseDto,
  toReceivableSummaryResponse,
} from '../presentation/dto/receivable-summary-response.dto';

@Injectable()
export class ListReceivablesUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    private readonly disputeRepo: IDisputeRepository,
    @Inject(INVOICE_REPOSITORY)
    private readonly invoiceRepo: IInvoiceRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: {
    filters: ReceivableListFilters;
    page: number;
    limit: number;
  }): Promise<{
    items: ReceivableSummaryResponseDto[];
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

    const [openDisputes, invoices] = await Promise.all([
      this.disputeRepo.findOpenDisputesByReceivableIds(receivableIds),
      this.invoiceRepo.findByIds(invoiceIds),
    ]);

    const now = new Date();
    const items = receivables.map((r) => {
      const isOverdue =
        r.status !== 'PAID' && r.dueDate.getTime() < now.getTime();
      const disputeId = openDisputes.get(r.id) ?? null;
      const invoiceNumber = r.invoiceId
        ? (invoices.get(r.invoiceId)?.invoiceNumber ?? null)
        : null;
      return toReceivableSummaryResponse(
        r,
        isOverdue,
        disputeId !== null,
        disputeId,
        invoiceNumber,
      );
    });

    return { items, total, page: input.page, limit: input.limit };
  }
}
