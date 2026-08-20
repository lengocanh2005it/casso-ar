import { ChangePasswordResendUseCase } from './change-password-resend.usecase';

describe('ChangePasswordResendUseCase', () => {
  it('emails a fresh OTP to the user', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ email: 'user@casso.vn' }]),
    };
    const otpRepo = { invalidatePrevious: jest.fn(), create: jest.fn() };
    const emailSender = { sendChangePasswordOtpEmail: jest.fn() };
    const useCase = new ChangePasswordResendUseCase(
      dataSource as any,
      otpRepo as any,
      emailSender as any,
    );

    await useCase.execute('user-1');

    expect(otpRepo.invalidatePrevious).toHaveBeenCalledWith('user-1');
    expect(otpRepo.create).toHaveBeenCalled();
    expect(emailSender.sendChangePasswordOtpEmail).toHaveBeenCalledWith(
      'user@casso.vn',
      expect.stringMatching(/^\d{6}$/),
    );
  });

  it('throws and does not email when the user is missing', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([]) };
    const otpRepo = { invalidatePrevious: jest.fn(), create: jest.fn() };
    const emailSender = { sendChangePasswordOtpEmail: jest.fn() };
    const useCase = new ChangePasswordResendUseCase(
      dataSource as any,
      otpRepo as any,
      emailSender as any,
    );

    await expect(useCase.execute('missing-user')).rejects.toThrow();

    expect(emailSender.sendChangePasswordOtpEmail).not.toHaveBeenCalled();
  });
});
