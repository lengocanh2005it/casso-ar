import { createHash } from 'node:crypto';
import { ChangePasswordConfirmUseCase } from './change-password-confirm.usecase';

describe('ChangePasswordConfirmUseCase', () => {
  const otp = '482913';
  const otpHash = createHash('sha256').update(otp).digest('hex');

  function buildOtpRecord(overrides: Partial<{ expiresAt: Date }> = {}) {
    return {
      id: 'otp-1',
      userId: 'user-1',
      otpHash,
      expiresAt: new Date(Date.now() + 60_000),
      ...overrides,
    };
  }

  it('updates the password and revokes every other session in one transaction', async () => {
    const otpRepo = {
      findValidOtp: jest.fn().mockResolvedValue(buildOtpRecord()),
      markUsed: jest.fn(),
    };
    const refreshTokenRepo = { revokeAllForUser: jest.fn() };
    const manager = { query: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (value: typeof manager) => Promise<unknown>) =>
          callback(manager),
      ),
    };
    const useCase = new ChangePasswordConfirmUseCase(
      dataSource as any,
      otpRepo as any,
      refreshTokenRepo as any,
    );

    await useCase.execute('user-1', otp, 'newSecurePassword123');

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(otpRepo.markUsed).toHaveBeenCalledWith('otp-1');
    expect(manager.query).toHaveBeenCalledWith(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      expect.arrayContaining(['user-1']),
    );
    expect(refreshTokenRepo.revokeAllForUser).toHaveBeenCalledWith(
      'user-1',
      manager,
    );
  });

  it('does not revoke any session when the OTP is invalid', async () => {
    const otpRepo = {
      findValidOtp: jest.fn().mockResolvedValue(null),
      markUsed: jest.fn(),
    };
    const refreshTokenRepo = { revokeAllForUser: jest.fn() };
    const dataSource = { query: jest.fn(), transaction: jest.fn() };
    const useCase = new ChangePasswordConfirmUseCase(
      dataSource as any,
      otpRepo as any,
      refreshTokenRepo as any,
    );

    await expect(
      useCase.execute('user-1', otp, 'newSecurePassword123'),
    ).rejects.toMatchObject({ errorCode: 'UNAUTHORIZED' });

    expect(refreshTokenRepo.revokeAllForUser).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('does not revoke any session when the OTP is expired', async () => {
    const otpRepo = {
      findValidOtp: jest
        .fn()
        .mockResolvedValue(buildOtpRecord({ expiresAt: new Date(0) })),
      markUsed: jest.fn(),
    };
    const refreshTokenRepo = { revokeAllForUser: jest.fn() };
    const dataSource = { query: jest.fn(), transaction: jest.fn() };
    const useCase = new ChangePasswordConfirmUseCase(
      dataSource as any,
      otpRepo as any,
      refreshTokenRepo as any,
    );

    await expect(
      useCase.execute('user-1', otp, 'newSecurePassword123'),
    ).rejects.toMatchObject({ errorCode: 'UNAUTHORIZED' });

    expect(refreshTokenRepo.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('rejects a malformed OTP without querying the repository', async () => {
    const otpRepo = { findValidOtp: jest.fn(), markUsed: jest.fn() };
    const refreshTokenRepo = { revokeAllForUser: jest.fn() };
    const dataSource = { query: jest.fn(), transaction: jest.fn() };
    const useCase = new ChangePasswordConfirmUseCase(
      dataSource as any,
      otpRepo as any,
      refreshTokenRepo as any,
    );

    await expect(
      useCase.execute('user-1', '12', 'newSecurePassword123'),
    ).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR' });
    expect(otpRepo.findValidOtp).not.toHaveBeenCalled();
  });

  it('rejects a password outside the length bounds', async () => {
    const otpRepo = { findValidOtp: jest.fn(), markUsed: jest.fn() };
    const refreshTokenRepo = { revokeAllForUser: jest.fn() };
    const dataSource = { query: jest.fn(), transaction: jest.fn() };
    const useCase = new ChangePasswordConfirmUseCase(
      dataSource as any,
      otpRepo as any,
      refreshTokenRepo as any,
    );

    await expect(useCase.execute('user-1', otp, 'short')).rejects.toMatchObject(
      { errorCode: 'VALIDATION_ERROR' },
    );
    expect(otpRepo.findValidOtp).not.toHaveBeenCalled();
  });
});
