import { QueryFailedError } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import { DUPLICATE_INVOICE_NUMBER } from '../application/invoice-repository.port';
import { Invoice, InvoiceStatus } from '../domain/invoice';
import { TypeOrmInvoiceRepository } from './typeorm-invoice.repository';

const PROPS = {
  id: 'inv-1',
  organizationId: 'org-1',
  customerId: 'cus-1',
  invoiceNumber: 'INV-001',
  issueDate: new Date('2026-08-01'),
  totalAmount: 1_000_000,
  taxAmount: 100_000,
  sourceType: 'MANUAL' as const,
  fileUrl: null,
  status: InvoiceStatus.ISSUED,
  createdAt: new Date('2026-08-01'),
};

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

describe('TypeOrmInvoiceRepository', () => {
  it('maps a domain Invoice to a plain ORM entity', async () => {
    const ormRepo = { save: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = new TenantContextService();
    const repo = new TypeOrmInvoiceRepository(ormRepo as any, tenantContext);

    await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      () => repo.save(new Invoice(PROPS)),
    );

    expect(ormRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'inv-1',
        organizationId: 'org-1',
        status: InvoiceStatus.ISSUED,
      }),
    );
    const saved = ormRepo.save.mock.calls[0][0];
    expect(saved).not.toBeInstanceOf(Invoice);
  });

  it('batch-fetches invoices by IDs within the current organization', async () => {
    const ormRepo = {
      find: jest.fn().mockResolvedValue([{ ...PROPS, id: 'inv-1' }]),
    };
    const tenantContext = new TenantContextService();
    const repo = new TypeOrmInvoiceRepository(ormRepo as any, tenantContext);

    const result = await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      () => repo.findByIds(['inv-1', 'inv-2']),
    );

    expect(ormRepo.find).toHaveBeenCalledWith({
      select: INVOICE_SELECT,
      where: { id: expect.anything(), organizationId: 'org-1' },
    });
    expect(result.get('inv-1')?.invoiceNumber).toBe('INV-001');
    expect(result.has('inv-2')).toBe(false);
  });

  it('translates an invoice-number unique violation into a duplicate-row AppError', async () => {
    const ormRepo = {
      save: jest.fn().mockRejectedValue(
        new QueryFailedError(
          'INSERT ...',
          [],
          Object.assign(new Error('duplicate key'), {
            code: '23505',
            constraint: 'UQ_invoices_organization_invoice_number',
          }),
        ),
      ),
    };
    const tenantContext = new TenantContextService();
    const repo = new TypeOrmInvoiceRepository(ormRepo as any, tenantContext);

    await expect(
      tenantContext.run(
        { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
        () => repo.save(new Invoice(PROPS)),
      ),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.CONFLICT,
      details: { rowErrorCode: DUPLICATE_INVOICE_NUMBER },
    });
  });

  it('rethrows unique violations on a different constraint unchanged', async () => {
    const dbError = new QueryFailedError(
      'INSERT ...',
      [],
      Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'UQ_other_thing',
      }),
    );
    const ormRepo = { save: jest.fn().mockRejectedValue(dbError) };
    const tenantContext = new TenantContextService();
    const repo = new TypeOrmInvoiceRepository(ormRepo as any, tenantContext);

    await expect(
      tenantContext.run(
        { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
        () => repo.save(new Invoice(PROPS)),
      ),
    ).rejects.toBe(dbError);
  });

  it('finds an invoice number through the transaction manager when supplied', async () => {
    const ormRepo = { findOne: jest.fn() };
    const managerRepo = { findOne: jest.fn().mockResolvedValue(PROPS) };
    const manager = { getRepository: jest.fn().mockReturnValue(managerRepo) };
    const tenantContext = new TenantContextService();
    const repo = new TypeOrmInvoiceRepository(ormRepo as any, tenantContext);

    const result = await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      () => repo.findByInvoiceNumber('INV-001', manager as any),
    );

    expect(result).toBeInstanceOf(Invoice);
    expect(ormRepo.findOne).not.toHaveBeenCalled();
    expect(managerRepo.findOne).toHaveBeenCalledWith({
      select: INVOICE_SELECT,
      where: { invoiceNumber: 'INV-001', organizationId: 'org-1' },
    });
  });

  it('finds an invoice number through the tenant-scoped repository without a manager', async () => {
    const ormRepo = { findOne: jest.fn().mockResolvedValue(PROPS) };
    const tenantContext = new TenantContextService();
    const repo = new TypeOrmInvoiceRepository(ormRepo as any, tenantContext);

    await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      () => repo.findByInvoiceNumber('INV-001'),
    );

    expect(ormRepo.findOne).toHaveBeenCalledWith({
      select: INVOICE_SELECT,
      where: { invoiceNumber: 'INV-001', organizationId: 'org-1' },
    });
  });
});
