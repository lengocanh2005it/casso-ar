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
});
