import { BullMqEmailQueue } from './email-queue.adapter';

function withRedisLock<T extends { getJob: jest.Mock }>(queue: T): T {
  const locks = new Map<string, string>();
  const getJob = queue.getJob;
  const redis = {
    defineCommand: jest.fn(),
    runCommand: jest.fn(async (command: string, args: unknown[]) => {
      const key = args[0];
      const token = args[1];
      if (typeof key !== 'string' || typeof token !== 'string') return 0;
      if (command.endsWith('Acquire')) {
        if (locks.has(key)) return null;
        locks.set(key, token);
        return 'OK';
      }
      if (locks.get(key) !== token) return 0;
      if (command.endsWith('Renew')) return 1;
      locks.delete(key);
      return 1;
    }),
  };
  queue.getJob = jest.fn(async (id: string) => {
    const job = await getJob(id);
    if (job && job.finishedOn === undefined) {
      job.finishedOn = Date.now() - 61_000;
    }
    return job;
  });
  return Object.assign(queue, {
    getBackend: () => ({ client: Promise.resolve(redis) }),
    toKey: (key: string) => `bull:email-queue:${key}`,
    redis,
  });
}

describe('BullMqEmailQueue.recoverReminderDelivery', () => {
  it('defers a recently failed primary job while its failed-event handler can enqueue SMTP fallback', async () => {
    const originalJob = {
      finishedOn: Date.now() - 30_000,
      getState: jest.fn().mockResolvedValue('failed'),
      retry: jest.fn().mockResolvedValue(undefined),
      attemptsMade: 3,
      opts: { attempts: 3 },
    };
    const queue = {
      getJob: jest
        .fn()
        .mockResolvedValueOnce(originalJob)
        .mockResolvedValueOnce(undefined),
    };
    const adapter = new BullMqEmailQueue(withRedisLock(queue) as any);

    const result = await adapter.recoverReminderDelivery('execution-1');

    expect(originalJob.retry).not.toHaveBeenCalled();
    expect(result).toBe('IN_FLIGHT');
  });

  it('returns MISSING when neither deterministic reminder job exists', async () => {
    const queue = { getJob: jest.fn().mockResolvedValue(undefined) };
    const adapter = new BullMqEmailQueue(withRedisLock(queue) as any);

    const result = await adapter.recoverReminderDelivery('execution-1');

    expect(queue.getJob).toHaveBeenNthCalledWith(1, 'execution-1');
    expect(queue.getJob).toHaveBeenNthCalledWith(
      2,
      'execution-1-resend-fallback',
    );
    expect(result).toBe('MISSING');
  });

  it('returns IN_FLIGHT without retrying when the original job is waiting', async () => {
    const job = {
      getState: jest.fn().mockResolvedValue('waiting'),
      retry: jest.fn(),
      attemptsMade: 3,
      opts: { attempts: 3 },
    };
    const queue = {
      getJob: jest
        .fn()
        .mockResolvedValueOnce(job)
        .mockResolvedValueOnce(undefined),
    };
    const adapter = new BullMqEmailQueue(withRedisLock(queue) as any);

    const result = await adapter.recoverReminderDelivery('execution-1');

    expect(job.retry).not.toHaveBeenCalled();
    expect(result).toBe('IN_FLIGHT');
  });

  it.each(['active', 'delayed'])(
    'returns IN_FLIGHT without retrying when the fallback job is %s',
    async (state) => {
      const originalJob = {
        getState: jest.fn().mockResolvedValue('failed'),
        retry: jest.fn(),
        attemptsMade: 3,
        opts: { attempts: 3 },
      };
      const fallbackJob = {
        getState: jest.fn().mockResolvedValue(state),
        retry: jest.fn(),
        attemptsMade: 0,
        opts: { attempts: 3 },
      };
      const queue = {
        getJob: jest
          .fn()
          .mockResolvedValueOnce(originalJob)
          .mockResolvedValueOnce(fallbackJob),
      };
      const adapter = new BullMqEmailQueue(withRedisLock(queue) as any);

      const result = await adapter.recoverReminderDelivery('execution-1');

      expect(originalJob.retry).not.toHaveBeenCalled();
      expect(fallbackJob.retry).not.toHaveBeenCalled();
      expect(result).toBe('IN_FLIGHT');
    },
  );

  it('returns COMPLETED without replaying a retained completed job', async () => {
    const job = {
      getState: jest.fn().mockResolvedValue('completed'),
      retry: jest.fn(),
      attemptsMade: 3,
      opts: { attempts: 3 },
    };
    const queue = {
      getJob: jest
        .fn()
        .mockResolvedValueOnce(job)
        .mockResolvedValueOnce(undefined),
    };
    const adapter = new BullMqEmailQueue(withRedisLock(queue) as any);

    const result = await adapter.recoverReminderDelivery('execution-1');

    expect(job.retry).not.toHaveBeenCalled();
    expect(result).toBe('COMPLETED');
  });

  it('retries the failed fallback once under its existing job ID without resetting attempts', async () => {
    const originalJob = {
      getState: jest.fn().mockResolvedValue('failed'),
      retry: jest.fn(),
      attemptsMade: 3,
      opts: { attempts: 3 },
    };
    const fallbackJob = {
      getState: jest.fn().mockResolvedValue('failed'),
      retry: jest.fn().mockResolvedValue(undefined),
      attemptsMade: 3,
      opts: { attempts: 3 },
    };
    const queue = {
      getJob: jest
        .fn()
        .mockResolvedValueOnce(originalJob)
        .mockResolvedValueOnce(fallbackJob),
    };
    const adapter = new BullMqEmailQueue(withRedisLock(queue) as any);

    const result = await adapter.recoverReminderDelivery('execution-1');

    expect(fallbackJob.retry).toHaveBeenCalledWith('failed');
    expect(originalJob.retry).not.toHaveBeenCalled();
    expect(result).toBe('RETRIED');
  });

  it('retries the original job when the fallback job is absent', async () => {
    const originalJob = {
      getState: jest.fn().mockResolvedValue('failed'),
      retry: jest.fn().mockResolvedValue(undefined),
      attemptsMade: 3,
      opts: { attempts: 3 },
    };
    const queue = {
      getJob: jest
        .fn()
        .mockResolvedValueOnce(originalJob)
        .mockResolvedValueOnce(undefined),
    };
    const adapter = new BullMqEmailQueue(withRedisLock(queue) as any);

    const result = await adapter.recoverReminderDelivery('execution-1');

    expect(originalJob.retry).toHaveBeenCalledWith('failed');
    expect(result).toBe('RETRIED');
  });

  it('returns IN_FLIGHT when another worker wins the retry state race', async () => {
    const retryConflict = Object.assign(new Error('Job is no longer failed'), {
      code: -3,
    });
    const job = {
      getState: jest
        .fn()
        .mockResolvedValueOnce('failed')
        .mockResolvedValueOnce('active'),
      retry: jest.fn().mockRejectedValue(retryConflict),
      attemptsMade: 3,
      opts: { attempts: 3 },
    };
    const queue = {
      getJob: jest
        .fn()
        .mockResolvedValueOnce(job)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(job),
    };
    const adapter = new BullMqEmailQueue(withRedisLock(queue) as any);

    const result = await adapter.recoverReminderDelivery('execution-1');

    expect(job.getState).toHaveBeenCalledTimes(2);
    expect(result).toBe('IN_FLIGHT');
  });

  it('propagates retry errors unrelated to a concurrent state change', async () => {
    const transportError = new Error('Redis unavailable');
    const job = {
      getState: jest.fn().mockResolvedValue('failed'),
      retry: jest.fn().mockRejectedValue(transportError),
      attemptsMade: 3,
      opts: { attempts: 3 },
    };
    const queue = {
      getJob: jest
        .fn()
        .mockResolvedValueOnce(job)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(job),
    };
    const adapter = new BullMqEmailQueue(withRedisLock(queue) as any);

    await expect(adapter.recoverReminderDelivery('execution-1')).rejects.toBe(
      transportError,
    );
  });

  it('does not replay a failed job again after its single recovery attempt', async () => {
    const job = {
      getState: jest.fn().mockResolvedValue('failed'),
      retry: jest.fn(),
      attemptsMade: 4,
      opts: { attempts: 3 },
    };
    const queue = {
      getJob: jest
        .fn()
        .mockResolvedValueOnce(job)
        .mockResolvedValueOnce(undefined),
    };
    const adapter = new BullMqEmailQueue(withRedisLock(queue) as any);

    const result = await adapter.recoverReminderDelivery('execution-1');

    expect(job.retry).not.toHaveBeenCalled();
    expect(result).toBe('EXHAUSTED');
  });

  it('serializes overlapping recovery calls so they cannot both replay one failed job', async () => {
    let releaseRetry: (() => void) | undefined;
    const job = {
      getState: jest.fn().mockResolvedValue('failed'),
      retry: jest.fn(
        () =>
          new Promise<void>((resolve) => {
            releaseRetry = resolve;
          }),
      ),
      attemptsMade: 3,
      opts: { attempts: 3 },
    };
    const queue = withRedisLock({
      getJob: jest.fn().mockResolvedValue(job),
    });
    const adapter = new BullMqEmailQueue(queue as any);
    const firstRecovery = adapter.recoverReminderDelivery('execution-1');

    for (let turn = 0; turn < 10 && !releaseRetry; turn += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    expect(releaseRetry).toBeDefined();

    await expect(adapter.recoverReminderDelivery('execution-1')).resolves.toBe(
      'IN_FLIGHT',
    );
    releaseRetry?.();
    await expect(firstRecovery).resolves.toBe('RETRIED');
    expect(job.retry).toHaveBeenCalledTimes(1);
  });

  it('does not treat an old final-failure event as current after the job is active', async () => {
    const job = {
      getState: jest.fn().mockResolvedValue('active'),
      attemptsMade: 3,
      opts: { attempts: 3 },
    };
    const queue = withRedisLock({ getJob: jest.fn().mockResolvedValue(job) });
    const adapter = new BullMqEmailQueue(queue as any);

    await expect(
      adapter.isReminderJobFailureCurrent('execution-1', 3),
    ).resolves.toBe(false);
  });

  it('reports a lost lease after running the operation instead of claiming it never acquired the lock', async () => {
    jest.useFakeTimers();
    try {
      const queue = withRedisLock({
        getJob: jest.fn().mockResolvedValue(undefined),
      }) as any;
      const runCommand = queue.redis.runCommand.getMockImplementation();
      queue.redis.runCommand.mockImplementation(
        async (command: string, args: unknown[]) =>
          command.endsWith('Renew') ? 0 : runCommand?.(command, args),
      );
      const adapter = new BullMqEmailQueue(queue as any);
      let releaseOperation: (() => void) | undefined;
      const lockedOperation = adapter.runWithReminderDeliveryLock(
        'execution-1',
        async () => {
          await new Promise<void>((resolve) => {
            releaseOperation = resolve;
          });
          return 'completed-side-effect';
        },
      );

      for (let turn = 0; turn < 10 && !releaseOperation; turn += 1) {
        await Promise.resolve();
      }
      await jest.advanceTimersByTimeAsync(10_000);
      releaseOperation?.();

      await expect(lockedOperation).resolves.toEqual({
        acquired: true,
        value: 'completed-side-effect',
        leaseLost: true,
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
