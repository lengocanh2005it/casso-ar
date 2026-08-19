import { Membership, Role } from '../../organizations/domain/membership';
import { Organization } from '../../organizations/domain/organization';
import { User } from '../../users/domain/user';
import { RejectOrganizationUseCase } from './reject-organization.usecase';

describe('RejectOrganizationUseCase', () => {
  it('moves a PENDING_REVIEW organization to REJECTED, audits the reason, and emails the owner without it', async () => {
    const organization = new Organization({
      id: 'org-1',
      name: 'Acme',
      status: 'PENDING_REVIEW',
      createdAt: new Date(),
    });
    const owner = new Membership({
      id: 'mem-1',
      organizationId: 'org-1',
      userId: 'user-1',
      role: Role.OWNER,
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });
    const ownerUser = new User({
      id: 'user-1',
      name: 'An',
      email: 'an@acme.vn',
      passwordHash: 'hash',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    const organizationRepo = {
      findById: jest.fn().mockResolvedValue(organization),
      save: jest.fn(),
    };
    const auditRepo = { save: jest.fn() };
    const membershipRepo = {
      findOwnerByOrganization: jest.fn().mockResolvedValue(owner),
    };
    const userRepo = { findById: jest.fn().mockResolvedValue(ownerUser) };
    const memberNotificationSender = {
      sendOrganizationRejectedEmail: jest.fn(),
    };
    const dataSource = { transaction: jest.fn((cb) => cb({})) };

    const useCase = new RejectOrganizationUseCase(
      dataSource as any,
      organizationRepo as any,
      auditRepo as any,
      membershipRepo as any,
      userRepo as any,
      memberNotificationSender as any,
    );

    await useCase.execute({
      organizationId: 'org-1',
      operatorId: 'op-1',
      reason: 'Tax code does not match any registered business',
    });

    expect(organizationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'REJECTED' }),
      {},
    );
    expect(auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'ORGANIZATION_REJECTED',
        reason: 'Tax code does not match any registered business',
      }),
      {},
    );
    expect(
      memberNotificationSender.sendOrganizationRejectedEmail,
    ).toHaveBeenCalledWith('an@acme.vn', 'Acme');
  });
});
