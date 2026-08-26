import { Inject, Injectable } from '@nestjs/common';
import {
  type AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import type { AuditLog } from '../../../common/audit/audit-log';
import {
  AUDIT_LOG_REPOSITORY,
  type AuditLogPageQuery,
  type IAuditLogRepository,
} from '../../../common/audit/audit-log-repository.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  CUSTOMER_REPOSITORY,
  type ICustomerRepository,
} from '../../customers/application/customer-repository.port';
import {
  type IInvoiceRepository,
  INVOICE_REPOSITORY,
} from '../../invoices/application/invoice-repository.port';

const UNKNOWN_CUSTOMER_LABEL = 'Khách hàng không xác định';
const UNKNOWN_INVOICE_LABEL = 'Hóa đơn không xác định';

export interface AuditLogDisplay {
  entityLabel: string | null;
  customerNames: Record<string, string>;
  invoiceNumbers: Record<string, string>;
}

export type AuditLogListItem = AuditLog & { display: AuditLogDisplay };

function fieldValues(log: AuditLog, field: string): string[] {
  const values = [log.afterState?.[field], log.beforeState?.[field]];
  return values.filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
}

function preferredFieldValue(log: AuditLog, field: string): string | null {
  return fieldValues(log, field)[0] ?? null;
}

function displayForLog(
  log: AuditLog,
  customerNames: Record<string, string>,
  invoiceNumbers: Record<string, string>,
): AuditLogDisplay {
  const customerId = preferredFieldValue(log, 'customerId');
  const invoiceId = preferredFieldValue(log, 'invoiceId');
  const customerName = customerId ? customerNames[customerId] : null;
  const invoiceNumber = invoiceId ? invoiceNumbers[invoiceId] : null;

  return {
    entityLabel:
      log.entityType === AuditEntityType.RECEIVABLE
        ? invoiceNumber && customerName
          ? `${invoiceNumber} · ${customerName}`
          : (invoiceNumber ?? customerName)
        : null,
    customerNames,
    invoiceNumbers,
  };
}

export interface ListAuditLogsInput {
  page: number;
  limit: number;
  entityType?: AuditEntityType;
  actionType?: AuditActionType;
  actorUserId?: string;
  receivableId?: string;
  from?: Date;
  to?: Date;
}

@Injectable()
export class ListAuditLogsUseCase {
  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly repo: IAuditLogRepository,
    private readonly tenantContext: TenantContextService,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
    @Inject(INVOICE_REPOSITORY)
    private readonly invoiceRepo: IInvoiceRepository,
  ) {}

  async execute(
    input: ListAuditLogsInput,
  ): Promise<{ items: AuditLogListItem[]; total: number }> {
    const query: AuditLogPageQuery = {
      organizationId: this.tenantContext.getOrganizationId(),
      page: input.page,
      limit: input.limit,
      ...(input.entityType ? { entityType: input.entityType } : {}),
      ...(input.actionType ? { actionType: input.actionType } : {}),
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      ...(input.receivableId
        ? { relatedReceivableId: input.receivableId }
        : {}),
      ...(input.from ? { from: input.from } : {}),
      ...(input.to ? { to: input.to } : {}),
    };
    const result = await this.repo.findPage(query);
    const referencesByLog = result.items.map((log) => ({
      customerIds: [...new Set(fieldValues(log, 'customerId'))],
      invoiceIds: [...new Set(fieldValues(log, 'invoiceId'))],
    }));
    const customerIds = [
      ...new Set(
        referencesByLog.flatMap((references) => references.customerIds),
      ),
    ];
    const invoiceIds = [
      ...new Set(
        referencesByLog.flatMap((references) => references.invoiceIds),
      ),
    ];

    const [customers, invoices] = await Promise.all([
      this.customerRepo.findByIds(customerIds),
      this.invoiceRepo.findByIds(invoiceIds),
    ]);

    const items = result.items.map((log, index) => {
      const references = referencesByLog[index];
      const customerNames = Object.fromEntries(
        references.customerIds.map((id) => [
          id,
          customers.get(id)?.name ?? UNKNOWN_CUSTOMER_LABEL,
        ]),
      );
      const invoiceNumbers = Object.fromEntries(
        references.invoiceIds.map((id) => [
          id,
          invoices.get(id)?.invoiceNumber ?? UNKNOWN_INVOICE_LABEL,
        ]),
      );

      return {
        ...log,
        display: displayForLog(log, customerNames, invoiceNumbers),
      };
    });

    return { items, total: result.total };
  }
}
