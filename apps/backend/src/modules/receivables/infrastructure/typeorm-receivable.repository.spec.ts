import { ReceivableStatus } from '@casso-ledger/shared-types';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import { Receivable } from '../domain/receivable';
import { TypeOrmReceivableRepository } from './typeorm-receivable.repository';

const PROPS = {
  id: 'rcv-1',
  organizationId: 'org-1',
  customerId: 'cus-1',
  invoiceId: null,
  originalAmount: 1_000_000,
  paidAmount: 250_000,
  dueDate: new Date('2026-08-01'),
  status: ReceivableStatus.PARTIALLY_PAID,
  salesRepresentativeId: null,
  createdAt: new Date('2026-07-01'),
  closedAt: null,
  version: 3,
};

describe('TypeOrmReceivableRepository', () => {
  it('maps a domain Receivable to a plain ORM entity preserving the version', async () => {
    const ormRepo = { save: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = new TenantContextService();
    const repo = new TypeOrmReceivableRepository(ormRepo as any, tenantContext);

    await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      () => repo.save(new Receivable(PROPS)),
    );

    expect(ormRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'rcv-1',
        organizationId: 'org-1',
        status: ReceivableStatus.PARTIALLY_PAID,
        version: 3,
      }),
    );
    const saved = ormRepo.save.mock.calls[0][0];
    expect(saved).not.toBeInstanceOf(Receivable);
  });
});
