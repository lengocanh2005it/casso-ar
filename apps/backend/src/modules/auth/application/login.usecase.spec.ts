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
      isOperator: false,
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
      errorCode: 'UNAUTHORIZED',
    });
  });

  it('signs a token for an operator without a membership', async () => {
    const user = new User({
      id: 'operator-1',
      name: 'Operator',
      email: 'operator@casso.vn',
      passwordHash: await hashPassword('pw'),
      emailVerifiedAt: new Date(),
      isOperator: true,
      createdAt: new Date(),
    });
    const userRepo = { findByEmail: jest.fn().mockResolvedValue(user) };
    const membershipRepo = {
      findFirstActiveByUserId: jest.fn().mockResolvedValue(null),
    };
    const refreshTokenRepo = { save: jest.fn() };
    const tokenSigner = { sign: jest.fn().mockReturnValue('signed-token') };
    const useCase = new LoginUseCase(
      userRepo as any,
      membershipRepo as any,
      refreshTokenRepo as any,
      tokenSigner as any,
    );

    await useCase.execute({ email: 'operator@casso.vn', password: 'pw' });

    expect(tokenSigner.sign).toHaveBeenCalledWith({
      userId: 'operator-1',
      isOperator: true,
    });
  });

  it('still rejects a non-operator without a membership', async () => {
    const user = new User({
      id: 'user-1',
      name: 'User',
      email: 'user@casso.vn',
      passwordHash: await hashPassword('pw'),
      emailVerifiedAt: new Date(),
      isOperator: false,
      createdAt: new Date(),
    });
    const useCase = new LoginUseCase(
      { findByEmail: jest.fn().mockResolvedValue(user) } as any,
      { findFirstActiveByUserId: jest.fn().mockResolvedValue(null) } as any,
      {} as any,
      {} as any,
    );
    await expect(
      useCase.execute({ email: 'user@casso.vn', password: 'pw' }),
    ).rejects.toMatchObject({ errorCode: 'FORBIDDEN' });
  });
});
