import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { CustomerOrmEntity } from '../../customers/infrastructure/customer.orm-entity';
import { DisputeOrmEntity } from '../../disputes/infrastructure/dispute.orm-entity';
import { InvoiceOrmEntity } from '../../invoices/infrastructure/invoice.orm-entity';
import { ReceivableOrmEntity } from '../../receivables/infrastructure/receivable.orm-entity';
import type {
  IReminderCandidateReader,
  ReminderCandidate,
} from '../application/reminder-candidate-reader.port';

@Injectable()
export class TypeOrmReminderCandidateReader
  implements IReminderCandidateReader
{
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findOpenCandidates(): Promise<ReminderCandidate[]> {
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.dataSource
      .getRepository(ReceivableOrmEntity)
      .createQueryBuilder('r')
      .innerJoin(CustomerOrmEntity, 'c', 'c.id = r."customerId"')
      .leftJoin(InvoiceOrmEntity, 'i', 'i.id = r."invoiceId"')
      .leftJoin(
        DisputeOrmEntity,
        'd',
        'd."receivableId" = r.id AND d.status = :disputeStatus',
        { disputeStatus: 'OPEN' },
      )
      .where('r."organizationId" = :organizationId', { organizationId })
      .andWhere('r.status IN (:...statuses)', {
        statuses: ['OPEN', 'PARTIALLY_PAID'],
      })
      .select([
        'r.id AS "receivableId"',
        'r."organizationId"',
        'r."customerId"',
        'c."customerGroup" AS "customerGroup"',
        'c.name AS "customerName"',
        'c.email AS "customerEmail"',
        'i."invoiceNumber" AS "invoiceNumber"',
        'r."originalAmount" AS "originalAmount"',
        'r."paidAmount" AS "paidAmount"',
        '(r."originalAmount" - r."paidAmount") AS "remainingAmount"',
        'r."dueDate" AS "dueDate"',
        'r.status AS status',
        'CASE WHEN d.id IS NOT NULL THEN true ELSE false END AS "isDisputed"',
      ])
      .getRawMany();

    return rows.map((r) => ({
      receivableId: r.receivableId,
      organizationId: r.organizationId,
      customerId: r.customerId,
      customerGroup: r.customerGroup,
      customerName: r.customerName,
      customerEmail: r.customerEmail,
      invoiceNumber: r.invoiceNumber,
      originalAmount: Number(r.originalAmount),
      paidAmount: Number(r.paidAmount),
      remainingAmount: Number(r.remainingAmount),
      dueDate: new Date(r.dueDate),
      status: r.status,
      isDisputed: r.isDisputed === true || r.isDisputed === 'true',
    }));
  }

  async findByReceivableId(
    receivableId: string,
  ): Promise<ReminderCandidate | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await this.dataSource
      .getRepository(ReceivableOrmEntity)
      .createQueryBuilder('r')
      .innerJoin(CustomerOrmEntity, 'c', 'c.id = r."customerId"')
      .leftJoin(InvoiceOrmEntity, 'i', 'i.id = r."invoiceId"')
      .leftJoin(
        DisputeOrmEntity,
        'd',
        'd."receivableId" = r.id AND d.status = :disputeStatus',
        { disputeStatus: 'OPEN' },
      )
      .where('r.id = :receivableId', { receivableId })
      .andWhere('r."organizationId" = :organizationId', { organizationId })
      .select([
        'r.id AS "receivableId"',
        'r."organizationId"',
        'r."customerId"',
        'c."customerGroup" AS "customerGroup"',
        'c.name AS "customerName"',
        'c.email AS "customerEmail"',
        'i."invoiceNumber" AS "invoiceNumber"',
        'r."originalAmount" AS "originalAmount"',
        'r."paidAmount" AS "paidAmount"',
        '(r."originalAmount" - r."paidAmount") AS "remainingAmount"',
        'r."dueDate" AS "dueDate"',
        'r.status AS status',
        'CASE WHEN d.id IS NOT NULL THEN true ELSE false END AS "isDisputed"',
      ])
      .getRawOne();

    if (!row) return null;

    return {
      receivableId: row.receivableId,
      organizationId: row.organizationId,
      customerId: row.customerId,
      customerGroup: row.customerGroup,
      customerName: row.customerName,
      customerEmail: row.customerEmail,
      invoiceNumber: row.invoiceNumber,
      originalAmount: Number(row.originalAmount),
      paidAmount: Number(row.paidAmount),
      remainingAmount: Number(row.remainingAmount),
      dueDate: new Date(row.dueDate),
      status: row.status,
      isDisputed: row.isDisputed === true || row.isDisputed === 'true',
    };
  }
}
