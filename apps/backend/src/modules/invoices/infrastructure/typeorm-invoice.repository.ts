import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { ReceivableOrmEntity } from '../../receivables/infrastructure/receivable.orm-entity';
import type { IInvoiceRepository } from '../application/invoice-repository.port';
import { Invoice } from '../domain/invoice';
import { InvoiceOrmEntity } from './invoice.orm-entity';

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
      where: { id, organizationId: this.tenantContext.getOrganizationId() },
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

  async findByReceivableId(receivableId: string): Promise<Invoice | null> {
    const receivable = await this.repo.manager.findOne(ReceivableOrmEntity, {
      where: {
        id: receivableId,
        organizationId: this.tenantContext.getOrganizationId(),
      },
      select: { invoiceId: true },
    });
    return receivable?.invoiceId ? this.findById(receivable.invoiceId) : null;
  }
}
