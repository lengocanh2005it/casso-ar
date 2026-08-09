import { Role } from '../../organizations/domain/membership';
import { MembershipInvite } from '../domain/membership-invite';
import { AcceptInviteUseCase } from './accept-invite.usecase';
import { hashToken } from './token-hasher';

describe('AcceptInviteUseCase', () => {
  it('creates a verified user and membership for a new invitee', async () => {
    const rawToken = 'c'.repeat(64);
    const invite = new MembershipInvite({
      id: 'inv-1',
      organizationId: 'org-1',
      email: 'new@congtyb.vn',
      role: Role.ACCOUNTANT,
      invitedByUserId: 'owner-1',
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60_000),
      acceptedAt: null,
      createdAt: new Date(),
    });
    const inviteRepo = {
      findByTokenHash: jest.fn().mockResolvedValue(invite),
      save: jest.fn(),
    };
    const userRepo = {
      findByEmail: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const membershipRepo = {
      save: jest.fn(),
      findByUserAndOrganization: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<unknown>) => callback({}),
      ),
    };

    const useCase = new AcceptInviteUseCase(
      inviteRepo as any,
      userRepo as any,
      membershipRepo as any,
      dataSource as any,
    );
    await useCase.execute({
      token: rawToken,
      name: 'New Invitee',
      password: 'NewPass123!',
      authenticatedUserId: 'another-user',
    });

    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New Invitee',
        emailVerifiedAt: expect.any(Date),
      }),
      expect.anything(),
    );
    expect(membershipRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        role: Role.ACCOUNTANT,
      }),
      expect.anything(),
    );
    expect(inviteRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ acceptedAt: expect.any(Date) }),
      expect.anything(),
    );
  });

  it('throws when the invite is already accepted', async () => {
    const rawToken = 'd'.repeat(64);
    const invite = new MembershipInvite({
      id: 'inv-2',
      organizationId: 'org-1',
      email: 'x@x.vn',
      role: Role.VIEWER,
      invitedByUserId: 'owner-1',
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60_000),
      acceptedAt: new Date(),
      createdAt: new Date(),
    });
    const useCase = new AcceptInviteUseCase(
      { findByTokenHash: jest.fn().mockResolvedValue(invite) } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await expect(
      useCase.execute({ token: rawToken, password: 'x' }),
    ).rejects.toMatchObject({
      errorCode: 'VALIDATION_ERROR',
    });
  });
});
