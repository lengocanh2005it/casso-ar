import { getTypeOrmConfig } from './typeorm.config';

describe('getTypeOrmConfig', () => {
  it('reads database settings from ConfigService with defaults', () => {
    const values: Record<string, string> = {
      DB_HOST: 'db',
      DB_PORT: '5433',
      DB_USERNAME: 'user',
      DB_PASSWORD: 'password',
      DB_DATABASE: 'ledger',
    };
    const config = {
      get: jest.fn(
        (key: string, defaultValue: unknown) => values[key] ?? defaultValue,
      ),
    };

    expect(getTypeOrmConfig(config as never)).toMatchObject({
      host: 'db',
      port: 5433,
      username: 'user',
      password: 'password',
      database: 'ledger',
    });
  });
});
