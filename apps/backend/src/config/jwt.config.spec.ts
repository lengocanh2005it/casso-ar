import { getJwtModuleOptions, getJwtSecret } from './jwt.config';

describe('getJwtSecret', () => {
  it('reads the required secret from ConfigService', () => {
    const config = { getOrThrow: jest.fn().mockReturnValue('secret') };

    expect(getJwtSecret(config as never)).toBe('secret');
    expect(config.getOrThrow).toHaveBeenCalledWith('JWT_SECRET');
  });

  it('fails fast when JWT_SECRET is set but empty', () => {
    const config = { getOrThrow: jest.fn().mockReturnValue('') };

    expect(() => getJwtSecret(config as never)).toThrow(/JWT_SECRET/);
  });

  it('builds shared JWT module options', () => {
    const config = { getOrThrow: jest.fn().mockReturnValue('secret') };

    expect(getJwtModuleOptions(config as never)).toEqual({
      secret: 'secret',
      signOptions: { expiresIn: '15m' },
      verifyOptions: { algorithms: ['HS256'] },
    });
  });
});
