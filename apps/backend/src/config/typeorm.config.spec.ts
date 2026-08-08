import { getTypeOrmConfig } from './typeorm.config';

function buildConfig(values: Record<string, string>) {
  return {
    get: jest.fn(
      (key: string, defaultValue: unknown) => values[key] ?? defaultValue,
    ),
    getOrThrow: jest.fn((key: string) => {
      if (values[key] === undefined) {
        throw new Error(`Missing required env var ${key}`);
      }
      return values[key];
    }),
  };
}

describe('getTypeOrmConfig', () => {
  it('reads database settings from ConfigService with defaults', () => {
    const config = buildConfig({
      DB_HOST: 'db',
      DB_PORT: '5433',
      DB_USERNAME: 'user',
      DB_PASSWORD: 'password',
      DB_DATABASE: 'ledger',
    });

    expect(getTypeOrmConfig(config as never)).toMatchObject({
      host: 'db',
      port: 5433,
      username: 'user',
      password: 'password',
      database: 'ledger',
    });
  });

  it('defaults DB_PASSWORD to empty string when unset', () => {
    const config = buildConfig({
      DB_HOST: 'db',
      DB_PORT: '5433',
      DB_USERNAME: 'user',
      DB_DATABASE: 'ledger',
    });

    expect(getTypeOrmConfig(config as never)).toMatchObject({
      password: '',
    });
  });

  it('disables synchronize when NODE_ENV is production', () => {
    const config = buildConfig({
      DB_HOST: 'db',
      DB_PORT: '5433',
      DB_USERNAME: 'user',
      DB_PASSWORD: 'password',
      DB_DATABASE: 'ledger',
      NODE_ENV: 'production',
    });

    expect(getTypeOrmConfig(config as never)).toMatchObject({
      synchronize: false,
    });
  });

  it('keeps synchronize on outside production', () => {
    const config = buildConfig({
      DB_HOST: 'db',
      DB_PORT: '5433',
      DB_USERNAME: 'user',
      DB_PASSWORD: 'password',
      DB_DATABASE: 'ledger',
    });

    expect(getTypeOrmConfig(config as never)).toMatchObject({
      synchronize: true,
    });
  });
});
