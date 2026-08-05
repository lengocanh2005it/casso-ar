import { Membership, Role } from '../../organizations/domain/membership';
import { SwitchOrganizationUseCase } from './switch-organization.usecase';

describe('SwitchOrganizationUseCase', () => {
  it('signs a new access token for an active membership', async () => {
    const membership = new Membership({
      id: 'mem-1',
      organizationId: 'org-2',
      userId: 'user-1',
      role: Role.ACCOUNTANT,
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });
    const membershipRepo = {
      findByUserAndOrganization: jest.fn().mockResolvedValue(membership),
    };
    const tokenSigner = { sign: jest.fn().mockReturnValue('signed.jwt.token') };

    const useCase = new SwitchOrganizationUseCase(
      membershipRepo as any,
      tokenSigner as any,
    );

    const result = await useCase.execute('user-1', 'org-2');

    expect(result.accessToken).toBe('signed.jwt.token');
    expect(tokenSigner.sign).toHaveBeenCalledWith({
      userId: 'user-1',
      organizationId: 'org-2',
      role: Role.ACCOUNTANT,
    });
  });

  it('throws FORBIDDEN when the user has no active membership in the target organization', async () => {
    const membershipRepo = {
      findByUserAndOrganization: jest.fn().mockResolvedValue(null),
    };
    const tokenSigner = { sign: jest.fn() };

    const useCase = new SwitchOrganizationUseCase(
      membershipRepo as any,
      tokenSigner as any,
    );

    await expect(useCase.execute('user-1', 'org-3')).rejects.toMatchObject({
      errorCode: 'FORBIDDEN',
    });
    expect(tokenSigner.sign).not.toHaveBeenCalled();
  });
});
