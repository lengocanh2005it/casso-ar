import { RedisAiMatchingGuard } from './redis-ai-matching-guard';

class InMemoryRedis {
  readonly values = new Map<string, string>();
  readonly keys: string[] = [];
  readonly lockTtls: number[] = [];
  shouldFail = false;

  async set(
    key: string,
    value: string,
    ...options: Array<string | number>
  ): Promise<'OK' | null> {
    this.throwWhenUnavailable();
    this.keys.push(key);
    const pxIndex = options.indexOf('PX');
    if (pxIndex >= 0) this.lockTtls.push(Number(options[pxIndex + 1]));
    if (options.includes('NX') && this.values.has(key)) return null;
    this.values.set(key, value);
    return 'OK';
  }

  async incr(key: string): Promise<number> {
    this.throwWhenUnavailable();
    this.keys.push(key);
    const value = Number(this.values.get(key) ?? 0) + 1;
    this.values.set(key, String(value));
    return value;
  }

  async decr(key: string): Promise<number> {
    this.throwWhenUnavailable();
    this.keys.push(key);
    const value = Number(this.values.get(key) ?? 0) - 1;
    this.values.set(key, String(value));
    return value;
  }

  async pexpire(key: string, _milliseconds: number): Promise<number> {
    this.throwWhenUnavailable();
    this.keys.push(key);
    return this.values.has(key) ? 1 : 0;
  }

  async eval(
    _script: string,
    _numberOfKeys: number,
    key: string,
    token: string,
  ): Promise<number> {
    this.throwWhenUnavailable();
    this.keys.push(key);
    if (this.values.get(key) !== token) return 0;
    this.values.delete(key);
    return 1;
  }

  private throwWhenUnavailable(): void {
    if (this.shouldFail) throw new Error('Redis unavailable');
  }
}

function createGuard(
  redis: InMemoryRedis,
  values: Record<string, string> = {},
): RedisAiMatchingGuard {
  return new RedisAiMatchingGuard(
    redis as never,
    {
      get: (key: string, fallback?: string) => values[key] ?? fallback,
    } as never,
  );
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  return {
    promise: new Promise<void>((done) => {
      resolve = done;
    }),
    resolve,
  };
}

describe('RedisAiMatchingGuard', () => {
  afterEach(() => jest.useRealTimers());

  it('skips without accessing Redis when AI matching is disabled', async () => {
    const redis = new InMemoryRedis();
    const operation = jest.fn().mockResolvedValue('provider result');

    const result = await createGuard(redis).run(
      { webhookInboxId: 'webhook-1', organizationId: 'org-1' },
      operation,
    );

    expect(result).toEqual({ outcome: 'skipped', reason: 'feature-disabled' });
    expect(operation).not.toHaveBeenCalled();
    expect(redis.keys).toEqual([]);
  });

  it('falls back to the safe timeout when its environment value is out of bounds', async () => {
    const redis = new InMemoryRedis();

    await createGuard(redis, {
      AI_MATCHING_ENABLED: 'true',
      AI_MATCHING_TIMEOUT_MS: '1',
    }).run(
      { webhookInboxId: 'webhook-1', organizationId: 'org-1' },
      async () => undefined,
    );

    expect(redis.lockTtls).toEqual([11_000]);
  });

  it('allows only the first concurrent attempt for one webhook', async () => {
    const redis = new InMemoryRedis();
    const guard = createGuard(redis, { AI_MATCHING_ENABLED: 'true' });
    const running = deferred();
    const started = deferred();
    const firstOperation = jest.fn(async () => {
      started.resolve();
      await running.promise;
      return 'first';
    });
    const duplicateOperation = jest.fn().mockResolvedValue('duplicate');

    const first = guard.run(
      { webhookInboxId: 'webhook-1', organizationId: 'org-1' },
      firstOperation,
    );
    await started.promise;
    const duplicate = await guard.run(
      { webhookInboxId: 'webhook-1', organizationId: 'org-1' },
      duplicateOperation,
    );
    running.resolve();

    await expect(first).resolves.toEqual({
      outcome: 'executed',
      value: 'first',
    });
    expect(duplicate).toEqual({ outcome: 'skipped', reason: 'duplicate' });
    expect(duplicateOperation).not.toHaveBeenCalled();
  });

  it('does not delete a lock replaced by another worker before cleanup', async () => {
    const redis = new InMemoryRedis();
    const guard = createGuard(redis, { AI_MATCHING_ENABLED: 'true' });

    await guard.run(
      { webhookInboxId: 'webhook-1', organizationId: 'org-1' },
      async () => {
        redis.values.set('ai-matching:lock:webhook-1', 'other-worker-token');
      },
    );

    expect(redis.values.get('ai-matching:lock:webhook-1')).toBe(
      'other-worker-token',
    );
  });

  it('limits each organization to two in-flight provider attempts', async () => {
    const redis = new InMemoryRedis();
    const guard = createGuard(redis, {
      AI_MATCHING_ENABLED: 'true',
      AI_MATCHING_CONCURRENCY: '2',
    });
    const running = deferred();
    const firstStarted = deferred();
    const secondStarted = deferred();
    const first = guard.run(
      { webhookInboxId: 'webhook-1', organizationId: 'org-1' },
      async () => {
        firstStarted.resolve();
        await running.promise;
      },
    );
    await firstStarted.promise;
    const second = guard.run(
      { webhookInboxId: 'webhook-2', organizationId: 'org-1' },
      async () => {
        secondStarted.resolve();
        await running.promise;
      },
    );
    await secondStarted.promise;
    const blockedOperation = jest.fn().mockResolvedValue(undefined);

    const blocked = await guard.run(
      { webhookInboxId: 'webhook-3', organizationId: 'org-1' },
      blockedOperation,
    );
    running.resolve();

    await Promise.all([first, second]);
    expect(blocked).toEqual({
      outcome: 'skipped',
      reason: 'concurrency-limit',
    });
    expect(blockedOperation).not.toHaveBeenCalled();
  });

  it('allows 100 daily attempts and resets the quota at Ho Chi Minh midnight', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T16:59:00.000Z'));
    const redis = new InMemoryRedis();
    const guard = createGuard(redis, {
      AI_MATCHING_ENABLED: 'true',
      AI_MATCHING_DAILY_LIMIT: '100',
    });
    const operation = jest.fn().mockResolvedValue(undefined);

    for (let index = 0; index < 100; index += 1) {
      await expect(
        guard.run(
          { webhookInboxId: `webhook-${index}`, organizationId: 'org-1' },
          operation,
        ),
      ).resolves.toEqual({ outcome: 'executed', value: undefined });
    }
    const blocked = await guard.run(
      { webhookInboxId: 'webhook-101', organizationId: 'org-1' },
      operation,
    );

    jest.setSystemTime(new Date('2026-01-01T17:00:00.000Z'));
    const nextDay = await guard.run(
      { webhookInboxId: 'webhook-next-day', organizationId: 'org-1' },
      operation,
    );

    expect(blocked).toEqual({ outcome: 'skipped', reason: 'daily-limit' });
    expect(nextDay).toEqual({ outcome: 'executed', value: undefined });
    expect(operation).toHaveBeenCalledTimes(101);
    expect(redis.keys).toContain('ai-matching:attempts:org-1:2026-01-01');
    expect(redis.keys).toContain('ai-matching:attempts:org-1:2026-01-02');
  });

  it('fails closed when Redis is unavailable and does not call the provider', async () => {
    const redis = new InMemoryRedis();
    redis.shouldFail = true;
    const operation = jest.fn().mockResolvedValue('provider result');

    const result = await createGuard(redis, {
      AI_MATCHING_ENABLED: 'true',
    }).run({ webhookInboxId: 'webhook-1', organizationId: 'org-1' }, operation);

    expect(result).toEqual({ outcome: 'skipped', reason: 'redis-unavailable' });
    expect(operation).not.toHaveBeenCalled();
  });

  it('propagates an operation failure after releasing its Redis reservations', async () => {
    const redis = new InMemoryRedis();
    const providerError = new Error('provider unavailable');

    await expect(
      createGuard(redis, { AI_MATCHING_ENABLED: 'true' }).run(
        { webhookInboxId: 'webhook-1', organizationId: 'org-1' },
        async () => {
          throw providerError;
        },
      ),
    ).rejects.toThrow(providerError);

    expect(redis.values.get('ai-matching:in-flight:org-1')).toBe('0');
    expect(redis.values.has('ai-matching:lock:webhook-1')).toBe(false);
  });
});
