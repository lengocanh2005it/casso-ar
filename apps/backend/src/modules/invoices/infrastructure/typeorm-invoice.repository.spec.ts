import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
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

  it('batch-fetches invoices for multiple receivables in two queries instead of one pair per receivable', async () => {
    const ormRepo = {
      find: jest.fn().mockResolvedValue([{ ...PROPS, id: 'inv-1' }]),
      manager: {
        find: jest.fn().mockResolvedValue([
          { id: 'rec-1', invoiceId: 'inv-1' },
          { id: 'rec-2', invoiceId: null },
        ]),
      },
    };
    const tenantContext = new TenantContextService();
    const repo = new TypeOrmInvoiceRepository(ormRepo as any, tenantContext);

    const result = await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      () => repo.findByReceivableIds(['rec-1', 'rec-2']),
    );

    expect(ormRepo.manager.find).toHaveBeenCalledTimes(1);
    expect(ormRepo.find).toHaveBeenCalledTimes(1);
    expect(result.get('rec-1')?.invoiceNumber).toBe('INV-001');
    expect(result.has('rec-2')).toBe(false);
  });
});
