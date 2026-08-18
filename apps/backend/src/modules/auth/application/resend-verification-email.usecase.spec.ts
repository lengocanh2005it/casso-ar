import { ResendVerificationEmailUseCase } from './resend-verification-email.usecase';

describe('ResendVerificationEmailUseCase', () => {
  it('replaces the pending token and sends a verification email', async () => {
    const user = {
      id: 'user-1',
      email: 'person@casso.vn',
      isEmailVerified: () => false,
    };
    const userRepo = { findByEmail: jest.fn().mockResolvedValue(user) };
    const verificationTokenRepo = {
      deleteByUserId: jest.fn(),
      save: jest.fn(),
    };
    const emailSender = { sendVerificationEmail: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => callback({}),
      ),
    };
    const useCase = new ResendVerificationEmailUseCase(
      userRepo as any,
      verificationTokenRepo as any,
      emailSender as any,
      dataSource as any,
    );

    await useCase.execute(' PERSON@CASSO.VN ');

    expect(userRepo.findByEmail).toHaveBeenCalledWith('person@casso.vn');
    expect(verificationTokenRepo.deleteByUserId).toHaveBeenCalledWith(
      'user-1',
      expect.anything(),
    );
    expect(verificationTokenRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      expect.anything(),
    );
    expect(emailSender.sendVerificationEmail).toHaveBeenCalledWith(
      'person@casso.vn',
      expect.stringContaining('/verify-email?token='),
    );
  });

  it('does not reveal or email when the account is missing or verified', async () => {
    const userRepo = { findByEmail: jest.fn().mockResolvedValue(null) };
    const verificationTokenRepo = {
      deleteByUserId: jest.fn(),
      save: jest.fn(),
    };
    const emailSender = { sendVerificationEmail: jest.fn() };
    const dataSource = { transaction: jest.fn() };
    const useCase = new ResendVerificationEmailUseCase(
      userRepo as any,
      verificationTokenRepo as any,
      emailSender as any,
      dataSource as any,
    );

    await expect(useCase.execute('missing@casso.vn')).resolves.toBeUndefined();

    expect(verificationTokenRepo.save).not.toHaveBeenCalled();
    expect(emailSender.sendVerificationEmail).not.toHaveBeenCalled();
  });
});
