import { getBullMqConfig } from './bullmq.config';

describe('getBullMqConfig', () => {
  function createConfig(values: Record<string, string> = {}) {
    return {
      get: jest.fn(
        (key: string, defaultValue: unknown) => values[key] ?? defaultValue,
      ),
    };
  }

  it('reads Redis connection settings from ConfigService with defaults', () => {
    const config = createConfig({
      REDIS_HOST: 'redis-host',
      REDIS_PORT: '6380',
    });

    const result = getBullMqConfig(config as never);

    expect(result.connection).toMatchObject({
      host: 'redis-host',
      port: 6380,
      connectTimeout: 5000,
    });
  });

  it('uses default host and port when env vars are absent', () => {
    const config = createConfig();

    const result = getBullMqConfig(config as never);

    expect(result.connection).toMatchObject({
      host: 'localhost',
      port: 6379,
    });
  });

  it('reads custom REDIS_MAX_RETRIES and REDIS_CONNECT_TIMEOUT', () => {
    const config = createConfig({
      REDIS_MAX_RETRIES: '3',
      REDIS_CONNECT_TIMEOUT: '3000',
    });

    const result = getBullMqConfig(config as never);

    expect(result.connection).toMatchObject({
      connectTimeout: 3000,
    });
  });

  describe('retryStrategy', () => {
    it('returns increasing delay up to 2000ms', () => {
      const config = createConfig({ REDIS_MAX_RETRIES: '10' });
      const result = getBullMqConfig(config as never);
      const retryStrategy = (result.connection as { retryStrategy: Function })
        .retryStrategy;

      expect(retryStrategy(1)).toBe(200);
      expect(retryStrategy(2)).toBe(400);
      expect(retryStrategy(10)).toBe(2000);
    });

    it('returns undefined (stops retrying) after exceeding max retries', () => {
      const config = createConfig({ REDIS_MAX_RETRIES: '3' });
      const result = getBullMqConfig(config as never);
      const retryStrategy = (result.connection as { retryStrategy: Function })
        .retryStrategy;

      expect(retryStrategy(4)).toBeUndefined();
    });

    it('does not stop retrying when within max retries', () => {
      const config = createConfig({ REDIS_MAX_RETRIES: '5' });
      const result = getBullMqConfig(config as never);
      const retryStrategy = (result.connection as { retryStrategy: Function })
        .retryStrategy;

      expect(retryStrategy(5)).not.toBeUndefined();
      expect(retryStrategy(5)).toBe(1000);
    });
  });
});
