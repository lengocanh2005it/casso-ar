import { Membership, Role } from '../../organizations/domain/membership';
import { User } from '../../users/domain/user';
import { LoginUseCase } from './login.usecase';
import { hashPassword } from './password-hasher';

describe('LoginUseCase', () => {
  it('returns access and refresh tokens for valid credentials', async () => {
    const passwordHash = await hashPassword('S3curePass!');
    const user = new User({
      id: 'user-1',
      name: 'An',
      email: 'ap@congtyb.vn',
      passwordHash,
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    const membership = new Membership({
      id: 'mem-1',
      organizationId: 'org-1',
      userId: 'user-1',
      role: Role.OWNER,
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });
    const userRepo = { findByEmail: jest.fn().mockResolvedValue(user) };
    const membershipRepo = {
      findFirstActiveByUserId: jest.fn().mockResolvedValue(membership),
    };
    const refreshTokenRepo = { save: jest.fn() };
    const jwtService = { sign: jest.fn().mockReturnValue('signed.jwt.token') };

    const useCase = new LoginUseCase(
      userRepo as any,
      membershipRepo as any,
      refreshTokenRepo as any,
      jwtService as any,
    );

    const result = await useCase.execute({
      email: 'AP@congtyb.vn',
      password: 'S3curePass!',
    });

    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.refreshToken).toHaveLength(64);
    expect(jwtService.sign).toHaveBeenCalledWith({
      userId: 'user-1',
      organizationId: 'org-1',
      role: Role.OWNER,
    });
    expect(refreshTokenRepo.save).toHaveBeenCalled();
  });

  it('throws on wrong password', async () => {
    const passwordHash = await hashPassword('correct-password');
    const user = new User({
      id: 'user-1',
      name: 'An',
      email: 'ap@congtyb.vn',
      passwordHash,
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    const useCase = new LoginUseCase(
      { findByEmail: jest.fn().mockResolvedValue(user) } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      useCase.execute({ email: 'ap@congtyb.vn', password: 'wrong-password' }),
    ).rejects.toMatchObject({
      status: 401,
      response: expect.objectContaining({ errorCode: 'UNAUTHORIZED' }),
    });
  });
});
