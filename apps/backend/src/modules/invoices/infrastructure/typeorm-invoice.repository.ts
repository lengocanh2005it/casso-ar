import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import type { TenantContextService } from '../../../common/tenancy/tenant-context';
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
    if (!row) return null;
    return new Invoice(row);
  }

  async save(invoice: Invoice, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(InvoiceOrmEntity) : this.repo;
    await repo.save({
      ...invoice,
      organizationId: this.tenantContext.getOrganizationId(),
    } as InvoiceOrmEntity);
  }
}
