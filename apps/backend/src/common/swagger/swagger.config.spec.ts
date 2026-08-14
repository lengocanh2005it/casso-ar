import {
  getSwaggerBasicAuthUsers,
  shouldProtectSwagger,
} from './swagger.config';

describe('shouldProtectSwagger', () => {
  it('protects the docs only in production', () => {
    expect(shouldProtectSwagger('production')).toBe(true);
    expect(shouldProtectSwagger('development')).toBe(false);
    expect(shouldProtectSwagger('test')).toBe(false);
    expect(shouldProtectSwagger(undefined)).toBe(false);
  });
});

describe('getSwaggerBasicAuthUsers', () => {
  function buildConfig(values: Record<string, string>) {
    return {
      getOrThrow: jest.fn((key: string) => {
        if (values[key] === undefined) {
          throw new Error(`Missing required env var ${key}`);
        }
        return values[key];
      }),
    };
  }

  it('reads the credentials from ConfigService', () => {
    const config = buildConfig({
      SWAGGER_USER: 'docs-admin',
      SWAGGER_PASSWORD: 's3cret',
    });

    expect(getSwaggerBasicAuthUsers(config as never)).toEqual({
      user: 'docs-admin',
      password: 's3cret',
    });
  });

  it('fails fast when either credential is missing', () => {
    expect(() =>
      getSwaggerBasicAuthUsers(buildConfig({ SWAGGER_USER: 'admin' }) as never),
    ).toThrow(/SWAGGER_PASSWORD/);
  });

  it('fails fast on empty credentials', () => {
    const config = buildConfig({
      SWAGGER_USER: '',
      SWAGGER_PASSWORD: 'x',
    });

    expect(() => getSwaggerBasicAuthUsers(config as never)).toThrow(
      /must not be empty/,
    );
  });
});
