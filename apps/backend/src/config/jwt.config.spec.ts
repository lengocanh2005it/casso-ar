import { getJwtSecret } from './jwt.config';

describe('getJwtSecret', () => {
  it('reads the required secret from ConfigService', () => {
    const config = { getOrThrow: jest.fn().mockReturnValue('secret') };

    expect(getJwtSecret(config as never)).toBe('secret');
    expect(config.getOrThrow).toHaveBeenCalledWith('JWT_SECRET');
  });
});
