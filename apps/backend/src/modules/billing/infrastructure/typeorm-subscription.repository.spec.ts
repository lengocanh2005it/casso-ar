import { PlanId, SubscriptionStatus } from '@casso-ledger/shared-types';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import { Subscription } from '../domain/subscription';
import { TypeOrmSubscriptionRepository } from './typeorm-subscription.repository';

const PROPS = {
  id: 'sub-1',
  organizationId: 'org-1',
  planId: PlanId.FREE,
  receivableMonthlyLimit: 50,
  bankConnectionLimit: 1,
  copilotChatMonthlyLimit: 50,
  status: SubscriptionStatus.ACTIVE,
  currentPeriodStart: new Date('2026-08-01'),
  currentPeriodEnd: new Date('2026-09-01'),
  createdAt: new Date('2026-08-01'),
  version: 5,
};

describe('TypeOrmSubscriptionRepository', () => {
  it('maps a domain Subscription to a plain ORM entity preserving the version', async () => {
    const ormRepo = { save: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = new TenantContextService();
    const repo = new TypeOrmSubscriptionRepository(
      ormRepo as any,
      tenantContext,
    );

    await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      () => repo.save(new Subscription(PROPS)),
    );

    expect(ormRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'sub-1',
        organizationId: 'org-1',
        planId: PlanId.FREE,
        version: 5,
      }),
    );
    const saved = ormRepo.save.mock.calls[0][0];
    expect(saved).not.toBeInstanceOf(Subscription);
  });
});
