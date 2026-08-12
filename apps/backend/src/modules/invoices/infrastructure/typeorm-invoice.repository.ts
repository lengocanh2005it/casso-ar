import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, FindOptionsSelect, Repository } from 'typeorm';
import { In, QueryFailedError } from 'typeorm';
import { isUniqueViolation } from '../../../common/database/unique-violation';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  DUPLICATE_INVOICE_NUMBER,
  type IInvoiceRepository,
} from '../application/invoice-repository.port';
import { Invoice } from '../domain/invoice';
import { InvoiceOrmEntity } from './invoice.orm-entity';

const INVOICE_NUMBER_UNIQUE_CONSTRAINT =
  'UQ_invoices_organization_invoice_number';

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
} satisfies FindOptionsSelect<InvoiceOrmEntity>;

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
    try {
      await repo.save(toOrm(invoice));
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        isUniqueViolation(error) &&
        this.isInvoiceNumberConstraint(error)
      ) {
        throw new AppError(ErrorCode.CONFLICT, 'Số hóa đơn đã tồn tại.', {
          rowErrorCode: DUPLICATE_INVOICE_NUMBER,
        });
      }
      throw error;
    }
  }

  private isInvoiceNumberConstraint(error: QueryFailedError): boolean {
    if (typeof error.driverError !== 'object' || error.driverError === null) {
      return false;
    }
    return (
      'constraint' in error.driverError &&
      error.driverError.constraint === INVOICE_NUMBER_UNIQUE_CONSTRAINT
    );
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
