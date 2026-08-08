import { Logger } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import type { Customer } from '../../customers/domain/customer';
import { CustomerGroup } from '../../customers/domain/customer-group';
import { Invoice, InvoiceStatus } from '../../invoices/domain/invoice';
import { ImportInvoicesUseCase } from './import-invoices.usecase';
import { getImportRequestFingerprint } from './import-request-fingerprint';

const validRow = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  customerName: '  Công ty A  ',
  customerTaxCode: '  TAX-1  ',
  customerEmail: '  Billing@Example.COM  ',
  invoiceNumber: '  INV-1  ',
  issueDate: '2026-08-01',
  dueDate: '2026-08-31',
  totalAmount: '1000',
  taxAmount: '100',
  ...overrides,
});

const customer = (id: string): Customer => ({
  id,
  organizationId: 'org-1',
  name: `Customer ${id}`,
  taxCode: `tax-${id}`,
  email: `${id}@example.com`,
  phone: '',
  defaultPaymentTermDays: 30,
  creditLimit: 0,
  priority: 1,
  customerGroup: CustomerGroup.REGULAR,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
});

function makeUseCase(rows: Record<string, unknown>[]) {
  const managers: EntityManager[] = rows.map(
    (_, index) => ({ label: `manager-${index + 1}` }) as any,
  );
  let managerIndex = 0;
  const dataSource = {
    transaction: jest.fn((callback: (manager: EntityManager) => unknown) =>
      Promise.resolve(callback(managers[managerIndex++])),
    ),
  };
  const customerRepo = {
    findById: jest.fn(),
    findByTaxCode: jest.fn().mockResolvedValue(null),
    findByEmail: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
  };
  const invoiceRepo = {
    findByInvoiceNumber: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
  };
  const createReceivableUseCase = {
    execute: jest.fn().mockResolvedValue({ id: 'receivable-1' }),
  };
  const tenantContext = {
    getOrganizationId: jest.fn(() => 'org-1'),
    getCurrentUser: jest.fn(() => ({
      userId: 'user-1',
      organizationId: 'org-1',
    })),
  };
  const auditRepo = {
    create: jest.fn().mockResolvedValue(undefined),
  };
  const fileRowParser = {
    parseFileToRows: jest
      .fn()
      .mockReturnValue({ rows, totalRows: rows.length }),
  };

  const useCase = new ImportInvoicesUseCase(
    customerRepo as any,
    invoiceRepo as any,
    createReceivableUseCase as any,
    tenantContext as any,
    dataSource as any,
    fileRowParser,
    auditRepo as any,
  );

  return {
    auditRepo,
    createReceivableUseCase,
    customerRepo,
    dataSource,
    invoiceRepo,
    fileRowParser,
    managers,
    tenantContext,
    useCase,
  };
}

describe('ImportInvoicesUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a customer, invoice, and receivable for one valid row', async () => {
    const {
      createReceivableUseCase,
      customerRepo,
      invoiceRepo,
      managers,
      useCase,
    } = makeUseCase([validRow()]);

    const result = await useCase.execute(Buffer.from('file'), 'invoices.csv');

    expect(result).toEqual({ totalRows: 1, successCount: 1, failedRows: [] });
    expect(customerRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        name: 'Công ty A',
        taxCode: 'TAX-1',
        email: 'billing@example.com',
        phone: '',
        defaultPaymentTermDays: 30,
        creditLimit: 0,
        priority: 1,
        customerGroup: CustomerGroup.REGULAR,
      }),
      managers[0],
    );
    const savedCustomer = customerRepo.save.mock.calls[0][0];
    expect(invoiceRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        customerId: savedCustomer.id,
        invoiceNumber: 'INV-1',
        totalAmount: 1000,
        taxAmount: 100,
        sourceType: 'IMPORT',
        fileUrl: null,
        status: InvoiceStatus.ISSUED,
      }),
      managers[0],
    );
    const savedInvoice = invoiceRepo.save.mock.calls[0][0];
    expect(createReceivableUseCase.execute).toHaveBeenCalledWith(
      {
        customerId: savedCustomer.id,
        invoiceId: savedInvoice.id,
        originalAmount: 1000,
        dueDate: new Date('2026-08-31T00:00:00.000Z'),
        salesRepresentativeId: 'user-1',
      },
      managers[0],
    );
  });

  it('resolves matching tax and email customers with lowercased email', async () => {
    const existing = customer('cust-1');
    const { customerRepo, invoiceRepo, useCase } = makeUseCase([validRow()]);
    customerRepo.findByTaxCode.mockResolvedValue(existing);
    customerRepo.findByEmail.mockResolvedValue(existing);

    await useCase.execute(Buffer.from('file'), 'invoices.csv');

    expect(customerRepo.findByTaxCode).toHaveBeenCalledWith(
      'TAX-1',
      expect.anything(),
    );
    expect(customerRepo.findByEmail).toHaveBeenCalledWith(
      'billing@example.com',
      expect.anything(),
    );
    expect(customerRepo.save).not.toHaveBeenCalled();
    expect(invoiceRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cust-1' }),
      expect.anything(),
    );
  });

  it('returns CUSTOMER_MISMATCH when tax and email resolve to different customers', async () => {
    const { customerRepo, invoiceRepo, useCase } = makeUseCase([validRow()]);
    customerRepo.findByTaxCode.mockResolvedValue(customer('tax-customer'));
    customerRepo.findByEmail.mockResolvedValue(customer('email-customer'));

    await expect(
      useCase.execute(Buffer.from('file'), 'invoices.csv'),
    ).resolves.toEqual({
      totalRows: 1,
      successCount: 0,
      failedRows: [
        {
          rowNumber: 2,
          data: validRow(),
          errors: ['CUSTOMER_MISMATCH'],
        },
      ],
    });
    expect(invoiceRepo.save).not.toHaveBeenCalled();
  });

  it('creates a customer for name-only rows with blank identifiers', async () => {
    const { customerRepo, useCase } = makeUseCase([
      validRow({ customerTaxCode: '', customerEmail: '' }),
    ]);

    await useCase.execute(Buffer.from('file'), 'invoices.csv');

    expect(customerRepo.findByTaxCode).not.toHaveBeenCalled();
    expect(customerRepo.findByEmail).not.toHaveBeenCalled();
    expect(customerRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ taxCode: '', email: '' }),
      expect.anything(),
    );
  });

  it('returns DUPLICATE_INVOICE_NUMBER for duplicate invoice numbers', async () => {
    const { customerRepo, invoiceRepo, useCase } = makeUseCase([validRow()]);
    invoiceRepo.findByInvoiceNumber.mockResolvedValue(
      new Invoice({
        id: 'invoice-existing',
        organizationId: 'org-1',
        customerId: 'cust-1',
        invoiceNumber: 'INV-1',
        issueDate: new Date('2026-08-01T00:00:00.000Z'),
        totalAmount: 1000,
        taxAmount: 100,
        sourceType: 'IMPORT',
        fileUrl: null,
        status: InvoiceStatus.ISSUED,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
    );

    const result = await useCase.execute(Buffer.from('file'), 'invoices.csv');

    expect(result.failedRows).toEqual([
      { rowNumber: 2, data: validRow(), errors: ['DUPLICATE_INVOICE_NUMBER'] },
    ]);
    expect(customerRepo.save).not.toHaveBeenCalled();
    expect(invoiceRepo.save).not.toHaveBeenCalled();
  });

  it('continues after validation, duplicate, mismatch, quota, and unexpected row failures', async () => {
    const rows = [
      validRow({ invoiceNumber: 'INVALID', totalAmount: '0' }),
      validRow({ invoiceNumber: 'DUP' }),
      validRow({
        invoiceNumber: 'MISMATCH',
        customerTaxCode: 'TAX-A',
        customerEmail: 'b@example.com',
      }),
      validRow({ invoiceNumber: 'QUOTA', totalAmount: '2005' }),
      validRow({ invoiceNumber: 'UNEXPECTED' }),
      validRow({ invoiceNumber: 'OK' }),
    ];
    const {
      createReceivableUseCase,
      customerRepo,
      dataSource,
      invoiceRepo,
      useCase,
    } = makeUseCase(rows);
    invoiceRepo.findByInvoiceNumber.mockImplementation(
      (invoiceNumber: string) =>
        invoiceNumber === 'DUP'
          ? Promise.resolve({ id: 'invoice-existing' })
          : null,
    );
    customerRepo.findByTaxCode.mockImplementation((taxCode: string) =>
      taxCode === 'TAX-A' ? Promise.resolve(customer('tax-customer')) : null,
    );
    customerRepo.findByEmail.mockImplementation((email: string) =>
      email === 'b@example.com'
        ? Promise.resolve(customer('email-customer'))
        : null,
    );
    invoiceRepo.save.mockImplementation((invoice: Invoice) => {
      if (invoice.invoiceNumber === 'UNEXPECTED') {
        throw new Error('raw database detail');
      }
    });
    createReceivableUseCase.execute.mockImplementation(
      ({ originalAmount }: { originalAmount: number }) => {
        if (originalAmount === 2005) {
          throw new AppError(
            ErrorCode.PLAN_LIMIT_EXCEEDED,
            'Receivable quota exceeded',
          );
        }
        return { id: 'receivable-1' };
      },
    );

    const result = await useCase.execute(Buffer.from('file'), 'invoices.csv');

    expect(result).toEqual({
      totalRows: 6,
      successCount: 1,
      failedRows: [
        { rowNumber: 2, data: rows[0], errors: ['VALIDATION_ERROR'] },
        { rowNumber: 3, data: rows[1], errors: ['DUPLICATE_INVOICE_NUMBER'] },
        { rowNumber: 4, data: rows[2], errors: ['CUSTOMER_MISMATCH'] },
        { rowNumber: 5, data: rows[3], errors: ['PLAN_LIMIT_EXCEEDED'] },
        { rowNumber: 6, data: rows[4], errors: ['IMPORT_ROW_FAILED'] },
      ],
    });
    expect(dataSource.transaction).toHaveBeenCalledTimes(5);
  });

  it('passes the same transaction manager to every dependency', async () => {
    const {
      createReceivableUseCase,
      customerRepo,
      invoiceRepo,
      managers,
      useCase,
    } = makeUseCase([validRow()]);

    await useCase.execute(Buffer.from('file'), 'invoices.csv');

    expect(invoiceRepo.findByInvoiceNumber).toHaveBeenCalledWith(
      'INV-1',
      managers[0],
    );
    expect(customerRepo.findByTaxCode).toHaveBeenCalledWith(
      'TAX-1',
      managers[0],
    );
    expect(customerRepo.findByEmail).toHaveBeenCalledWith(
      'billing@example.com',
      managers[0],
    );
    expect(customerRepo.save).toHaveBeenCalledWith(
      expect.anything(),
      managers[0],
    );
    expect(invoiceRepo.save).toHaveBeenCalledWith(
      expect.anything(),
      managers[0],
    );
    expect(createReceivableUseCase.execute).toHaveBeenCalledWith(
      expect.anything(),
      managers[0],
    );
  });

  it('sanitizes unexpected row failures before logging', async () => {
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { invoiceRepo, useCase } = makeUseCase([validRow()]);
    invoiceRepo.save.mockRejectedValue(new Error('password=secret'));

    const result = await useCase.execute(Buffer.from('file'), 'invoices.csv');

    expect(result.failedRows).toEqual([
      { rowNumber: 2, data: validRow(), errors: ['IMPORT_ROW_FAILED'] },
    ]);
    expect(JSON.stringify(loggerSpy.mock.calls)).not.toContain(
      'password=secret',
    );
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Invoice import row failed',
        rowNumber: 2,
        invoiceNumber: 'INV-1',
        organizationId: 'org-1',
        userId: 'user-1',
        errorName: 'Error',
      }),
    );
  });

  it('writes one metadata-only audit record after the import', async () => {
    const rows = [
      validRow({ invoiceNumber: 'OK' }),
      validRow({ invoiceNumber: 'INVALID', totalAmount: '0' }),
    ];
    const { auditRepo, useCase } = makeUseCase(rows);
    const file = Buffer.from('file');
    const fileSha256 = getImportRequestFingerprint(file, 'invoices.csv');

    await useCase.execute(file, 'invoices.csv');

    expect(auditRepo.create).toHaveBeenCalledTimes(1);
    expect(auditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        actionType: AuditActionType.INVOICE_IMPORT,
        entityType: AuditEntityType.INVOICE_IMPORT,
        entityId: fileSha256,
        beforeState: null,
        afterState: {
          filename: 'invoices.csv',
          fileSha256,
          totalRows: 2,
          successCount: 1,
          failedCount: 1,
        },
        ipAddress: null,
        createdAt: expect.any(Date),
      }),
    );
    expect(
      JSON.stringify(auditRepo.create.mock.calls[0][0].afterState),
    ).not.toContain('invoiceNumber');
  });

  it('does not change a successful result when audit writing fails', async () => {
    const { auditRepo, useCase } = makeUseCase([validRow()]);
    auditRepo.create.mockRejectedValue(new Error('audit down'));

    await expect(
      useCase.execute(Buffer.from('file'), 'invoices.csv'),
    ).resolves.toEqual({
      totalRows: 1,
      successCount: 1,
      failedRows: [],
    });
  });
});
