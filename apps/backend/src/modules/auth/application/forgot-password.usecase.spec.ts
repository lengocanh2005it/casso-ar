import { ForgotPasswordUseCase } from './forgot-password.usecase';

describe('ForgotPasswordUseCase', () => {
  const previousCorsOrigin = process.env.CORS_ORIGIN;

  afterEach(() => {
    if (previousCorsOrigin === undefined) {
      delete process.env.CORS_ORIGIN;
    } else {
      process.env.CORS_ORIGIN = previousCorsOrigin;
    }
  });

  it('emails an absolute reset-password link at the frontend origin', async () => {
    process.env.CORS_ORIGIN = 'https://app.casso.vn';
    const user = { id: 'user-1', email: 'person@casso.vn' };
    const userRepo = { findByEmail: jest.fn().mockResolvedValue(user) };
    const resetTokenRepo = { save: jest.fn() };
    const emailSender = { sendPasswordResetEmail: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => callback({}),
      ),
    };
    const useCase = new ForgotPasswordUseCase(
      userRepo as any,
      resetTokenRepo as any,
      emailSender as any,
      dataSource as any,
    );

    await useCase.execute('person@casso.vn');

    expect(emailSender.sendPasswordResetEmail).toHaveBeenCalledWith(
      'person@casso.vn',
      expect.stringMatching(
        /^https:\/\/app\.casso\.vn\/reset-password\?token=/,
      ),
    );
  });

  it('does not email when the account is missing', async () => {
    const userRepo = { findByEmail: jest.fn().mockResolvedValue(null) };
    const resetTokenRepo = { save: jest.fn() };
    const emailSender = { sendPasswordResetEmail: jest.fn() };
    const dataSource = { transaction: jest.fn() };
    const useCase = new ForgotPasswordUseCase(
      userRepo as any,
      resetTokenRepo as any,
      emailSender as any,
      dataSource as any,
    );

    await expect(useCase.execute('missing@casso.vn')).resolves.toBeUndefined();

    expect(emailSender.sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});
