import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type {
  IReminderCandidateReader,
  ReminderCandidate,
} from '../application/reminder-candidate-reader.port';

interface ReminderCandidateRow {
  receivableId: string;
  organizationId: string;
  customerId: string;
  customerGroup: string;
  customerName: string;
  customerEmail: string;
  invoiceNumber: string | null;
  originalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  dueDate: string;
  status: string;
  isDisputed: boolean | string;
}

function toCandidate(row: ReminderCandidateRow): ReminderCandidate {
  return {
    receivableId: row.receivableId,
    organizationId: row.organizationId,
    customerId: row.customerId,
    customerGroup: row.customerGroup as ReminderCandidate['customerGroup'],
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    invoiceNumber: row.invoiceNumber,
    originalAmount: Number(row.originalAmount),
    paidAmount: Number(row.paidAmount),
    remainingAmount: Number(row.remainingAmount),
    dueDate: new Date(row.dueDate),
    status: row.status as ReminderCandidate['status'],
    isDisputed: row.isDisputed === true || row.isDisputed === 'true',
  };
}

@Injectable()
export class TypeOrmReminderCandidateReader
  implements IReminderCandidateReader
{
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  // Reads across the customers/invoices/disputes/receivables tables by raw
  // table name (not their ORM entity classes) so this module's
  // infrastructure layer never imports another module's infrastructure —
  // see scripts/check-cross-module-infrastructure.mjs.
  private baseQuery(organizationId: string) {
    return this.dataSource
      .createQueryBuilder()
      .from('receivables', 'r')
      .innerJoin('customers', 'c', 'c.id::text = r."customerId"')
      .leftJoin('invoices', 'i', 'i.id::text = r."invoiceId"')
      .leftJoin(
        'disputes',
        'd',
        'd."receivableId" = r.id AND d.status = :disputeStatus',
        { disputeStatus: 'OPEN' },
      )
      .where('r."organizationId" = :organizationId', { organizationId })
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
      ]);
  }

  async findOpenCandidates(): Promise<ReminderCandidate[]> {
    const organizationId = this.tenantContext.getOrganizationId();
    const rows: ReminderCandidateRow[] = await this.baseQuery(organizationId)
      .andWhere('r.status IN (:...statuses)', {
        statuses: ['OPEN', 'PARTIALLY_PAID'],
      })
      .getRawMany();

    return rows.map(toCandidate);
  }

  async findByReceivableId(
    receivableId: string,
  ): Promise<ReminderCandidate | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row: ReminderCandidateRow | undefined = await this.baseQuery(
      organizationId,
    )
      .andWhere('r.id = :receivableId', { receivableId })
      .getRawOne();

    return row ? toCandidate(row) : null;
  }
}
