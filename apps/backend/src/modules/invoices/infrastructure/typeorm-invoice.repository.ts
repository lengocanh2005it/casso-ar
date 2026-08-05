import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
// biome-ignore lint/style/useImportType: must be a value import — NestJS DI resolves this constructor param via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Function`
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { IInvoiceRepository } from '../application/invoice-repository.port';
import { Invoice } from '../domain/invoice';
import { InvoiceOrmEntity } from './invoice.orm-entity';

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
    await repo.save(invoice as InvoiceOrmEntity);
  }
}
