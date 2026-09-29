import { Membership, Role } from '../../organizations/domain/membership';
import { Organization } from '../../organizations/domain/organization';
import { User } from '../../users/domain/user';
import { LoginUseCase } from './login.usecase';
import { hashPassword } from './password-hasher';

describe('LoginUseCase', () => {
  function buildOrganizationRepo(status: string) {
    return {
      findById: jest.fn().mockResolvedValue(
        new Organization({
          id: 'org-1',
          name: 'Acme',
          status: status as any,
          createdAt: new Date(),
        }),
      ),
    };
  }

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
    const organizationRepo = buildOrganizationRepo('ACTIVE');

    const useCase = new LoginUseCase(
      userRepo as any,
      membershipRepo as any,
      refreshTokenRepo as any,
      jwtService as any,
      organizationRepo as any,
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
    // Each login starts its own session, so a later logout can end just it.
    expect(refreshTokenRepo.save.mock.calls[0][0].sessionId).toEqual(
      expect.any(String),
    );
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
    const organizationRepo = buildOrganizationRepo('ACTIVE');
    const useCase = new LoginUseCase(
      { findByEmail: jest.fn().mockResolvedValue(user) } as any,
      {} as any,
      {} as any,
      {} as any,
      organizationRepo as any,
    );

    await expect(
      useCase.execute({ email: 'ap@congtyb.vn', password: 'wrong-password' }),
    ).rejects.toMatchObject({
      errorCode: 'UNAUTHORIZED',
    });
  });

  it('throws EMAIL_NOT_VERIFIED for a correct password but an unverified email', async () => {
    const passwordHash = await hashPassword('S3curePass!');
    const user = new User({
      id: 'user-1',
      name: 'An',
      email: 'ap@congtyb.vn',
      passwordHash,
      emailVerifiedAt: null,
      createdAt: new Date(),
    });
    const organizationRepo = buildOrganizationRepo('ACTIVE');
    const useCase = new LoginUseCase(
      { findByEmail: jest.fn().mockResolvedValue(user) } as any,
      {} as any,
      {} as any,
      {} as any,
      organizationRepo as any,
    );

    await expect(
      useCase.execute({ email: 'ap@congtyb.vn', password: 'S3curePass!' }),
    ).rejects.toMatchObject({
      errorCode: 'EMAIL_NOT_VERIFIED',
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
      {} as any,
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
      {} as any,
    );
    await expect(
      useCase.execute({ email: 'user@casso.vn', password: 'pw' }),
    ).rejects.toMatchObject({ errorCode: 'FORBIDDEN' });
  });

  it('issues a session for an already verified user', async () => {
    const user = new User({
      id: 'user-1',
      name: 'An',
      email: 'ap@congtyb.vn',
      passwordHash: 'unused',
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
    const userRepo = { findById: jest.fn().mockResolvedValue(user) };
    const membershipRepo = {
      findFirstActiveByUserId: jest.fn().mockResolvedValue(membership),
    };
    const refreshTokenRepo = { save: jest.fn() };
    const tokenSigner = { sign: jest.fn().mockReturnValue('signed-token') };
    const organizationRepo = buildOrganizationRepo('ACTIVE');
    const useCase = new LoginUseCase(
      userRepo as any,
      membershipRepo as any,
      refreshTokenRepo as any,
      tokenSigner as any,
      organizationRepo as any,
    );

    const result = await useCase.executeForUser('user-1');

    expect(result.accessToken).toBe('signed-token');
    expect(result.refreshToken).toHaveLength(64);
    expect(tokenSigner.sign).toHaveBeenCalledWith({
      userId: 'user-1',
      organizationId: 'org-1',
      role: Role.OWNER,
      isOperator: false,
    });
  });

  it('throws ORGANIZATION_PENDING_REVIEW when the caller organization is pending review', async () => {
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
    const organizationRepo = buildOrganizationRepo('PENDING_REVIEW');
    const useCase = new LoginUseCase(
      userRepo as any,
      membershipRepo as any,
      refreshTokenRepo as any,
      jwtService as any,
      organizationRepo as any,
    );

    await expect(
      useCase.execute({ email: 'ap@congtyb.vn', password: 'S3curePass!' }),
    ).rejects.toMatchObject({ errorCode: 'ORGANIZATION_PENDING_REVIEW' });
    expect(refreshTokenRepo.save).not.toHaveBeenCalled();
  });

  it('throws ORGANIZATION_REJECTED when the caller organization was rejected', async () => {
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
    const organizationRepo = buildOrganizationRepo('REJECTED');
    const useCase = new LoginUseCase(
      userRepo as any,
      membershipRepo as any,
      refreshTokenRepo as any,
      jwtService as any,
      organizationRepo as any,
    );

    await expect(
      useCase.execute({ email: 'ap@congtyb.vn', password: 'S3curePass!' }),
    ).rejects.toMatchObject({ errorCode: 'ORGANIZATION_REJECTED' });
  });
});
