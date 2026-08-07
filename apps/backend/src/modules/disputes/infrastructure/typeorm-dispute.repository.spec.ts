import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import { Dispute, DisputeStatus } from '../domain/dispute';
import { TypeOrmDisputeRepository } from './typeorm-dispute.repository';

const PROPS = {
  id: 'dispute-1',
  organizationId: 'org-1',
  receivableId: 'receivable-1',
  reason: 'Số tiền không khớp.',
  status: DisputeStatus.OPEN,
  openedByUserId: 'user-1',
  resolvedByUserId: null,
  resolvedAt: null,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  version: 1,
};

describe('TypeOrmDisputeRepository', () => {
  it('maps a domain Dispute to a plain ORM entity with the tenant', async () => {
    const ormRepo = { save: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = new TenantContextService();
    const repository = new TypeOrmDisputeRepository(
      ormRepo as any,
      tenantContext,
    );

    await tenantContext.run(
      { userId: 'user-1', organizationId: 'org-1', role: Role.OWNER },
      () => repository.save(new Dispute(PROPS)),
    );

    expect(ormRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'dispute-1',
        organizationId: 'org-1',
        status: DisputeStatus.OPEN,
        version: 1,
      }),
    );
    expect(ormRepo.save.mock.calls[0][0]).not.toBeInstanceOf(Dispute);
  });

  it('scopes open-dispute lookup to the current organization', async () => {
    const row = { ...PROPS };
    const ormRepo = {
      findOne: jest.fn().mockResolvedValue(row),
    };
    const tenantContext = new TenantContextService();
    const repository = new TypeOrmDisputeRepository(
      ormRepo as any,
      tenantContext,
    );

    await tenantContext.run(
      { userId: 'user-1', organizationId: 'org-1', role: Role.OWNER },
      () => repository.findOpenDispute('receivable-1'),
    );

    expect(ormRepo.findOne).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        receivableId: 'receivable-1',
        status: DisputeStatus.OPEN,
      },
    });
  });
});
