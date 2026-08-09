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
});
