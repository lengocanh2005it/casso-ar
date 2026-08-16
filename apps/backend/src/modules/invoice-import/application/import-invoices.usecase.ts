import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { AuditLog } from '../../../common/audit/audit-log';
import {
  AUDIT_LOG_REPOSITORY,
  type IAuditLogRepository,
} from '../../../common/audit/audit-log-repository.port';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { JsonLogger } from '../../../common/observability/json-logger.service';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  CUSTOMER_REPOSITORY,
  type ICustomerRepository,
} from '../../customers/application/customer-repository.port';
import type { Customer } from '../../customers/domain/customer';
import { CustomerGroup } from '../../customers/domain/customer-group';
import {
  DUPLICATE_INVOICE_NUMBER,
  type IInvoiceRepository,
  INVOICE_REPOSITORY,
  isDuplicateInvoiceNumberError,
} from '../../invoices/application/invoice-repository.port';
import { Invoice, InvoiceStatus } from '../../invoices/domain/invoice';
import { CreateReceivableUseCase } from '../../receivables/application/create-receivable.usecase';
import {
  IMPORT_FILE_ROW_PARSER,
  type ImportFileRowParser,
} from './import-file-row-parser.port';
import { getImportRequestFingerprint } from './import-request-fingerprint';
import { type ParsedInvoiceRow, parseInvoiceRow } from './invoice-row-parser';

const IMPORT_ROW_FAILED = 'IMPORT_ROW_FAILED';

export interface ImportRowFailure {
  rowNumber: number;
  data: Record<string, unknown>;
  errors: string[];
}

export interface ImportInvoicesResult {
  totalRows: number;
  successCount: number;
  failedRows: ImportRowFailure[];
}

@Injectable()
export class ImportInvoicesUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
    @Inject(INVOICE_REPOSITORY)
    private readonly invoiceRepo: IInvoiceRepository,
    private readonly createReceivableUseCase: CreateReceivableUseCase,
    private readonly tenantContext: TenantContextService,
    private readonly dataSource: DataSource,
    @Inject(IMPORT_FILE_ROW_PARSER)
    private readonly fileRowParser: ImportFileRowParser,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly logger: JsonLogger,
  ) {}

  async execute(
    buffer: Buffer,
    filename: string,
  ): Promise<ImportInvoicesResult> {
    const currentUser = this.tenantContext.getCurrentUser();
    if (!currentUser) {
      throw new AppError(
        ErrorCode.UNAUTHORIZED,
        'Không tìm thấy người dùng hiện tại',
      );
    }

    const { rows, totalRows } = this.fileRowParser.parseFileToRows(
      buffer,
      filename,
    );
    const fileSha256 = getImportRequestFingerprint(buffer, filename);
    const organizationId = currentUser.organizationId;
    const requestId = currentUser.requestId ?? 'unknown';

    const failedRows: ImportRowFailure[] = [];
    let successCount = 0;

    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 2;
      try {
        const parsed = parseInvoiceRow(row);
        await this.dataSource.transaction((manager) =>
          this.importRow(parsed, currentUser.userId, organizationId, manager),
        );
        successCount += 1;
      } catch (error) {
        const isExpectedDuplicate = isDuplicateInvoiceNumberError(error);
        failedRows.push({
          rowNumber,
          data: row,
          errors: [this.rowErrorCode(error)],
        });
        if (!(error instanceof AppError) && !isExpectedDuplicate) {
          this.logger.error({
            message: 'Invoice import row failed',
            rowNumber,
            invoiceNumber:
              typeof row.invoiceNumber === 'string'
                ? row.invoiceNumber.trim()
                : undefined,
            organizationId,
            userId: currentUser.userId,
            requestId,
            errorName: error instanceof Error ? error.name : typeof error,
          });
        }
      }
    }

    const result = { totalRows, successCount, failedRows };
    this.writeAudit(
      filename,
      fileSha256,
      result,
      organizationId,
      currentUser.userId,
      requestId,
    );
    return result;
  }

  private async importRow(
    row: ParsedInvoiceRow,
    userId: string,
    organizationId: string,
    manager: EntityManager,
  ): Promise<void> {
    const existingInvoice = await this.invoiceRepo.findByInvoiceNumber(
      row.invoiceNumber,
      manager,
    );
    if (existingInvoice) {
      throw new AppError(ErrorCode.CONFLICT, 'Số hóa đơn đã tồn tại', {
        rowErrorCode: DUPLICATE_INVOICE_NUMBER,
      });
    }

    const customer = await this.resolveCustomer(row, organizationId, manager);
    const invoice = new Invoice({
      id: randomUUID(),
      organizationId,
      customerId: customer.id,
      invoiceNumber: row.invoiceNumber,
      issueDate: row.issueDate,
      totalAmount: row.totalAmount,
      taxAmount: row.taxAmount,
      sourceType: 'IMPORT',
      fileUrl: null,
      status: InvoiceStatus.ISSUED,
      createdAt: new Date(),
    });
    await this.invoiceRepo.save(invoice, manager);
    await this.createReceivableUseCase.execute(
      {
        customerId: customer.id,
        invoiceId: invoice.id,
        originalAmount: row.totalAmount,
        dueDate: row.dueDate,
        salesRepresentativeId: userId,
      },
      manager,
    );
  }

  private async resolveCustomer(
    row: ParsedInvoiceRow,
    organizationId: string,
    manager: EntityManager,
  ): Promise<Customer> {
    const taxCustomer = row.customerTaxCode
      ? await this.customerRepo.findByTaxCode(row.customerTaxCode, manager)
      : null;
    const emailCustomer = row.customerEmail
      ? await this.customerRepo.findByEmail(row.customerEmail, manager)
      : null;

    if (taxCustomer && emailCustomer && taxCustomer.id !== emailCustomer.id) {
      throw new AppError(
        ErrorCode.CUSTOMER_MISMATCH,
        'Mã số thuế và email thuộc hai khách hàng khác nhau',
      );
    }

    const existing = taxCustomer ?? emailCustomer;
    if (existing) return existing;

    const customer: Customer = {
      id: randomUUID(),
      organizationId,
      name: row.customerName,
      taxCode: row.customerTaxCode ?? '',
      email: row.customerEmail ?? '',
      phone: '',
      defaultPaymentTermDays: 30,
      creditLimit: 0,
      priority: 1,
      customerGroup: CustomerGroup.REGULAR,
      createdAt: new Date(),
    };
    await this.customerRepo.save(customer, manager);
    return customer;
  }

  private rowErrorCode(error: unknown): string {
    if (isDuplicateInvoiceNumberError(error)) {
      return DUPLICATE_INVOICE_NUMBER;
    }
    if (!(error instanceof AppError)) return IMPORT_ROW_FAILED;
    if (
      typeof error.details === 'object' &&
      error.details !== null &&
      'rowErrorCode' in error.details &&
      typeof error.details.rowErrorCode === 'string'
    ) {
      return error.details.rowErrorCode;
    }
    return error.errorCode;
  }

  private writeAudit(
    filename: string,
    fileSha256: string,
    result: ImportInvoicesResult,
    organizationId: string,
    userId: string,
    requestId: string = 'unknown',
  ): void {
    const log = new AuditLog({
      organizationId,
      userId,
      actionType: AuditActionType.INVOICE_IMPORT,
      entityType: AuditEntityType.INVOICE_IMPORT,
      entityId: fileSha256,
      beforeState: null,
      afterState: {
        filename,
        fileSha256,
        totalRows: result.totalRows,
        successCount: result.successCount,
        failedCount: result.failedRows.length,
      },
      ipAddress: null,
      createdAt: new Date(),
    });

    // ponytail: audit is fire-and-forget per import spec; make it durable with
    // an outbox only if audit outages need retry guarantees.
    void this.auditLogRepo.create(log).catch((error: unknown) => {
      this.logger.error({
        message: 'Invoice import audit failed',
        organizationId,
        userId,
        requestId,
        entityId: fileSha256,
        errorName: error instanceof Error ? error.name : typeof error,
      });
    });
  }
}
