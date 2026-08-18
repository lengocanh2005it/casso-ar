import { REQUIRED_PERMISSION_KEY } from '../../../common/rbac/require-permission.decorator';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  it('getMe requires only authentication, not a business permission', () => {
    const requiredPermission = Reflect.getMetadata(
      REQUIRED_PERMISSION_KEY,
      AuthController.prototype.getMe,
    );
    expect(requiredPermission).toBeUndefined();
  });

  it('returns a session and sets the refresh cookie after email verification', async () => {
    const verifyEmailUseCase = {
      execute: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    };
    const response = { cookie: jest.fn() };
    const controller = new AuthController(
      {} as never,
      verifyEmailUseCase as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: jest.fn().mockReturnValue('development') } as never,
    );

    await expect(
      controller.verifyEmail({ token: 'token' }, response as never),
    ).resolves.toEqual({ verified: true, accessToken: 'access-token' });
    expect(response.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-token',
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it('resends verification email without exposing account existence', async () => {
    const resendVerificationEmailUseCase = {
      execute: jest.fn(),
    };
    const controller = new AuthController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      resendVerificationEmailUseCase as never,
      { get: jest.fn().mockReturnValue('development') } as never,
    );

    await expect(
      controller.resendVerification({ email: 'person@casso.vn' }),
    ).resolves.toEqual({ success: true });
    expect(resendVerificationEmailUseCase.execute).toHaveBeenCalledWith(
      'person@casso.vn',
    );
  });
});
