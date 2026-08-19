import { Membership, Role } from '../../organizations/domain/membership';
import { Organization } from '../../organizations/domain/organization';
import { User } from '../../users/domain/user';
import { ApproveOrganizationUseCase } from './approve-organization.usecase';

describe('ApproveOrganizationUseCase', () => {
  it('moves a PENDING_REVIEW organization to ACTIVE, audits it, and emails the owner', async () => {
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
      sendOrganizationApprovedEmail: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn((cb) => cb({})),
    };

    const useCase = new ApproveOrganizationUseCase(
      dataSource as any,
      organizationRepo as any,
      auditRepo as any,
      membershipRepo as any,
      userRepo as any,
      memberNotificationSender as any,
    );

    await useCase.execute({ organizationId: 'org-1', operatorId: 'op-1' });

    expect(organizationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACTIVE' }),
      {},
    );
    expect(auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        operatorId: 'op-1',
        actionType: 'ORGANIZATION_APPROVED',
      }),
      {},
    );
    expect(
      memberNotificationSender.sendOrganizationApprovedEmail,
    ).toHaveBeenCalledWith('an@acme.vn', 'Acme');
  });

  it('throws CONFLICT when the organization is not PENDING_REVIEW', async () => {
    const organization = new Organization({
      id: 'org-1',
      name: 'Acme',
      status: 'ACTIVE',
      createdAt: new Date(),
    });
    const organizationRepo = {
      findById: jest.fn().mockResolvedValue(organization),
      save: jest.fn(),
    };
    const auditRepo = { save: jest.fn() };
    const membershipRepo = { findOwnerByOrganization: jest.fn() };
    const userRepo = { findById: jest.fn() };
    const memberNotificationSender = {
      sendOrganizationApprovedEmail: jest.fn(),
    };
    const dataSource = { transaction: jest.fn((cb) => cb({})) };

    const useCase = new ApproveOrganizationUseCase(
      dataSource as any,
      organizationRepo as any,
      auditRepo as any,
      membershipRepo as any,
      userRepo as any,
      memberNotificationSender as any,
    );

    await expect(
      useCase.execute({ organizationId: 'org-1', operatorId: 'op-1' }),
    ).rejects.toMatchObject({ errorCode: 'CONFLICT' });
    expect(organizationRepo.save).not.toHaveBeenCalled();
  });
});
