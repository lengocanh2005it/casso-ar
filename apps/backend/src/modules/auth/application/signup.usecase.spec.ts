import { SignupUseCase } from './signup.usecase';

describe('SignupUseCase', () => {
  it('creates the organization bootstrap and verification token before emailing it', async () => {
    const userRepo = {
      findByEmail: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const organizationRepo = { save: jest.fn() };
    const membershipRepo = { save: jest.fn() };
    const verificationTokenRepo = { save: jest.fn() };
    const subscriptionRepo = { save: jest.fn() };
    const organizationBootstrap = { seed: jest.fn() };
    const emailSender = { sendVerificationEmail: jest.fn() };
    const loginUseCase = {
      execute: jest.fn().mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
      }),
    };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => callback({}),
      ),
    };

    const useCase = new SignupUseCase(
      userRepo as any,
      organizationRepo as any,
      membershipRepo as any,
      verificationTokenRepo as any,
      subscriptionRepo as any,
      organizationBootstrap as any,
      emailSender as any,
      loginUseCase as any,
      dataSource as any,
    );

    const result = await useCase.execute({
      organizationName: 'Company B',
      name: 'An',
      email: 'AP@congtyb.vn',
      password: 'S3curePass!',
    });

    expect(result.organization.name).toBe('Company B');
    expect(result.membership.role).toBe('OWNER');
    expect(userRepo.save).toHaveBeenCalled();
    expect(organizationRepo.save).toHaveBeenCalled();
    expect(membershipRepo.save).toHaveBeenCalled();
    expect(subscriptionRepo.save).toHaveBeenCalled();
    expect(organizationBootstrap.seed).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
    );
    expect(verificationTokenRepo.save).toHaveBeenCalled();
    expect(emailSender.sendVerificationEmail).toHaveBeenCalledWith(
      'ap@congtyb.vn',
      expect.stringContaining('/auth/verify-email?token='),
    );
  });

  it('throws if the email is already registered', async () => {
    const userRepo = {
      findByEmail: jest.fn().mockResolvedValue({ id: 'existing' }),
      save: jest.fn(),
    };
    const useCase = new SignupUseCase(
      userRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      useCase.execute({
        organizationName: 'X',
        name: 'X',
        email: 'dup@x.vn',
        password: 'password',
      }),
    ).rejects.toMatchObject({ errorCode: 'CONFLICT', statusCode: 409 });
  });
});
