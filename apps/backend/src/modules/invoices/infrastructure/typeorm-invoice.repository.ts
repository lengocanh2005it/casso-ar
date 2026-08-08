import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { In } from 'typeorm';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { IInvoiceRepository } from '../application/invoice-repository.port';
import { Invoice } from '../domain/invoice';
import { InvoiceOrmEntity } from './invoice.orm-entity';

const INVOICE_SELECT = {
  id: true,
  organizationId: true,
  customerId: true,
  invoiceNumber: true,
  issueDate: true,
  totalAmount: true,
  taxAmount: true,
  sourceType: true,
  fileUrl: true,
  status: true,
  createdAt: true,
};

// Explicit domain → ORM translation: the compiler checks every field, so a
// drift between the two shapes fails here instead of being cast away.
function toOrm(invoice: Invoice): InvoiceOrmEntity {
  return {
    id: invoice.id,
    organizationId: invoice.organizationId,
    customerId: invoice.customerId,
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    totalAmount: invoice.totalAmount,
    taxAmount: invoice.taxAmount,
    sourceType: invoice.sourceType,
    fileUrl: invoice.fileUrl,
    status: invoice.status,
    createdAt: invoice.createdAt,
  };
}

@Injectable()
export class TypeOrmInvoiceRepository implements IInvoiceRepository {
  constructor(
    @InjectRepository(InvoiceOrmEntity)
    private readonly repo: Repository<InvoiceOrmEntity>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findById(id: string): Promise<Invoice | null> {
    const row = await this.repo.findOne({
      select: INVOICE_SELECT,
      where: { id, organizationId: this.tenantContext.getOrganizationId() },
    });
    return row ? new Invoice(row) : null;
  }

  async findByInvoiceNumber(
    invoiceNumber: string,
    manager?: EntityManager,
  ): Promise<Invoice | null> {
    const repo = manager ? manager.getRepository(InvoiceOrmEntity) : this.repo;
    const row = await repo.findOne({
      select: INVOICE_SELECT,
      where: {
        invoiceNumber,
        organizationId: this.tenantContext.getOrganizationId(),
      },
    });
    return row ? new Invoice(row) : null;
  }

  async save(invoice: Invoice, manager?: EntityManager): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    if (invoice.organizationId !== organizationId) {
      throw new Error('TENANT_MISMATCH');
    }
    const repo = manager ? manager.getRepository(InvoiceOrmEntity) : this.repo;
    await repo.save(toOrm(invoice));
  }

  async findByIds(ids: string[]): Promise<Map<string, Invoice>> {
    if (ids.length === 0) return new Map();
    const organizationId = this.tenantContext.getOrganizationId();
    const invoiceRows = await this.repo.find({
      select: INVOICE_SELECT,
      where: { id: In(ids), organizationId },
    });
    return new Map(invoiceRows.map((row) => [row.id, new Invoice(row)]));
  }
}
