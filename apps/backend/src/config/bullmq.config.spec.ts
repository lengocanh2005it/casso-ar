import { getBullMqConfig } from './bullmq.config';

describe('getBullMqConfig', () => {
  it('reads Redis connection settings from ConfigService with defaults', () => {
    const values: Record<string, string> = {
      REDIS_HOST: 'redis-host',
      REDIS_PORT: '6380',
    };
    const config = {
      get: jest.fn(
        (key: string, defaultValue: unknown) => values[key] ?? defaultValue,
      ),
    };

    expect(getBullMqConfig(config as never)).toEqual({
      connection: { host: 'redis-host', port: 6380 },
    });
  });
});
