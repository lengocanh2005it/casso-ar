import { ChangePasswordRequestUseCase } from './change-password-request.usecase';
import { hashPassword } from './password-hasher';

describe('ChangePasswordRequestUseCase', () => {
  it('emails the generated OTP to the user', async () => {
    const passwordHash = await hashPassword('current-password');
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValue([
          { password_hash: passwordHash, email: 'user@casso.vn' },
        ]),
    };
    const otpRepo = { invalidatePrevious: jest.fn(), create: jest.fn() };
    const emailSender = { sendChangePasswordOtpEmail: jest.fn() };
    const useCase = new ChangePasswordRequestUseCase(
      dataSource as any,
      otpRepo as any,
      emailSender as any,
    );

    await useCase.execute('user-1', 'current-password');

    expect(otpRepo.create).toHaveBeenCalled();
    expect(emailSender.sendChangePasswordOtpEmail).toHaveBeenCalledWith(
      'user@casso.vn',
      expect.stringMatching(/^\d{6}$/),
    );
  });

  it('throws and does not email when the current password is wrong', async () => {
    const passwordHash = await hashPassword('current-password');
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValue([
          { password_hash: passwordHash, email: 'user@casso.vn' },
        ]),
    };
    const otpRepo = { invalidatePrevious: jest.fn(), create: jest.fn() };
    const emailSender = { sendChangePasswordOtpEmail: jest.fn() };
    const useCase = new ChangePasswordRequestUseCase(
      dataSource as any,
      otpRepo as any,
      emailSender as any,
    );

    await expect(useCase.execute('user-1', 'wrong-password')).rejects.toThrow();

    expect(emailSender.sendChangePasswordOtpEmail).not.toHaveBeenCalled();
  });
});
