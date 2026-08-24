import { PendingSignup } from '../domain/pending-signup';
import { ResendVerificationEmailUseCase } from './resend-verification-email.usecase';

describe('ResendVerificationEmailUseCase', () => {
  it('replaces the pending token and sends a verification email for an existing unverified user', async () => {
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
    const pendingSignupRepo = { findByEmail: jest.fn(), save: jest.fn() };
    const emailSender = { sendVerificationEmail: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<unknown>) =>
          callback({}),
      ),
    };
    const useCase = new ResendVerificationEmailUseCase(
      userRepo as any,
      verificationTokenRepo as any,
      pendingSignupRepo as any,
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
      expect.stringMatching(/^\d{6}$/),
    );
    expect(pendingSignupRepo.findByEmail).not.toHaveBeenCalled();
  });

  it('resends a new OTP for a pending signup when there is no user account yet', async () => {
    const pendingSignup = new PendingSignup({
      id: 'pending-1',
      email: 'new@casso.vn',
      passwordHash: 'hashed',
      name: 'An',
      organizationName: 'Acme Co',
      taxCode: '0101234567',
      taxCodeMatched: true,
      taxCodeLookupName: 'Acme Co',
      otpHash: 'old-hash',
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    });
    const userRepo = { findByEmail: jest.fn().mockResolvedValue(null) };
    const verificationTokenRepo = { deleteByUserId: jest.fn(), save: jest.fn() };
    const pendingSignupRepo = {
      findByEmail: jest.fn().mockResolvedValue(pendingSignup),
      save: jest.fn(),
    };
    const emailSender = { sendVerificationEmail: jest.fn() };
    const dataSource = { transaction: jest.fn() };
    const useCase = new ResendVerificationEmailUseCase(
      userRepo as any,
      verificationTokenRepo as any,
      pendingSignupRepo as any,
      emailSender as any,
      dataSource as any,
    );

    await useCase.execute(' NEW@CASSO.VN ');

    expect(pendingSignupRepo.findByEmail).toHaveBeenCalledWith('new@casso.vn');
    expect(pendingSignupRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pending-1', otpHash: expect.any(String) }),
    );
    expect(pendingSignupRepo.save.mock.calls[0][0].otpHash).not.toBe('old-hash');
    expect(emailSender.sendVerificationEmail).toHaveBeenCalledWith(
      'new@casso.vn',
      expect.stringMatching(/^\d{6}$/),
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('does not reveal or email when neither a user nor a pending signup exists', async () => {
    const userRepo = { findByEmail: jest.fn().mockResolvedValue(null) };
    const verificationTokenRepo = { deleteByUserId: jest.fn(), save: jest.fn() };
    const pendingSignupRepo = {
      findByEmail: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const emailSender = { sendVerificationEmail: jest.fn() };
    const dataSource = { transaction: jest.fn() };
    const useCase = new ResendVerificationEmailUseCase(
      userRepo as any,
      verificationTokenRepo as any,
      pendingSignupRepo as any,
      emailSender as any,
      dataSource as any,
    );

    await expect(useCase.execute('missing@casso.vn')).resolves.toBeUndefined();

    expect(pendingSignupRepo.save).not.toHaveBeenCalled();
    expect(emailSender.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('does not resend for an already-verified user, and does not fall through to the pending-signup branch', async () => {
    const user = { id: 'user-1', email: 'v@casso.vn', isEmailVerified: () => true };
    const userRepo = { findByEmail: jest.fn().mockResolvedValue(user) };
    const verificationTokenRepo = { deleteByUserId: jest.fn(), save: jest.fn() };
    const pendingSignupRepo = {
      findByEmail: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const emailSender = { sendVerificationEmail: jest.fn() };
    const dataSource = { transaction: jest.fn() };
    const useCase = new ResendVerificationEmailUseCase(
      userRepo as any,
      verificationTokenRepo as any,
      pendingSignupRepo as any,
      emailSender as any,
      dataSource as any,
    );

    await useCase.execute('v@casso.vn');

    expect(emailSender.sendVerificationEmail).not.toHaveBeenCalled();
    expect(pendingSignupRepo.findByEmail).not.toHaveBeenCalled();
  });
});
