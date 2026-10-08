import { randomUUID } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { IRedisClient, Queue } from 'bullmq';
import type {
  AuthEmailJob,
  IEmailQueue,
  OwnerAlertEmailJob,
  ReminderDeliveryLockResult,
  ReminderDeliveryRecoveryResult,
  ReminderEmailJob,
} from '../application/email-queue.port';
import { EMAIL_QUEUE } from './email-queue.constants';

const REMINDER_DELIVERY_LOCK_TTL_MS = 30_000;
const REMINDER_DELIVERY_LOCK_RENEW_INTERVAL_MS = 10_000;
const REMINDER_FAILURE_HANDLER_LOCK_POLL_MS = 100;
const RECENT_FAILURE_GRACE_MS = 60_000;

const ACQUIRE_LOCK_COMMAND = 'cassoReminderDeliveryLockAcquire';
const RENEW_LOCK_COMMAND = 'cassoReminderDeliveryLockRenew';
const RELEASE_LOCK_COMMAND = 'cassoReminderDeliveryLockRelease';

const ACQUIRE_LOCK_SCRIPT = `
  return redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2], 'NX') or false
`;

const RENEW_LOCK_SCRIPT = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('PEXPIRE', KEYS[1], ARGV[2])
  end
  return 0
`;

const RELEASE_LOCK_SCRIPT = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
`;

const redisClientsWithLockCommands = new WeakSet<IRedisClient>();

function ensureReminderLockCommands(redis: IRedisClient): void {
  if (redisClientsWithLockCommands.has(redis)) return;
  redis.defineCommand(ACQUIRE_LOCK_COMMAND, {
    numberOfKeys: 1,
    lua: ACQUIRE_LOCK_SCRIPT,
  });
  redis.defineCommand(RENEW_LOCK_COMMAND, {
    numberOfKeys: 1,
    lua: RENEW_LOCK_SCRIPT,
  });
  redis.defineCommand(RELEASE_LOCK_COMMAND, {
    numberOfKeys: 1,
    lua: RELEASE_LOCK_SCRIPT,
  });
  redisClientsWithLockCommands.add(redis);
}

function isInFlightState(state: string): boolean {
  return state !== 'failed' && state !== 'completed' && state !== 'unknown';
}

function isRetryStateConflict(error: unknown): boolean {
  if (
    !(error instanceof Error) ||
    !('code' in error) ||
    typeof error.code !== 'number'
  ) {
    return false;
  }
  return [-1, -2, -3].includes(error.code);
}

@Injectable()
export class BullMqEmailQueue implements IEmailQueue {
  constructor(@InjectQueue(EMAIL_QUEUE) private readonly queue: Queue) {}

  async runWithReminderDeliveryLock<T>(
    executionId: string,
    operation: () => Promise<T>,
    waitForLockMs = 0,
  ): Promise<ReminderDeliveryLockResult<T>> {
    const redis = await this.queue.getBackend().client;
    ensureReminderLockCommands(redis);
    const lockKey = this.queue.toKey(`reminder-delivery-lock:${executionId}`);
    const token = randomUUID();
    const deadline = Date.now() + Math.max(0, waitForLockMs);

    while (true) {
      const acquired: unknown = await redis.runCommand(ACQUIRE_LOCK_COMMAND, [
        lockKey,
        token,
        REMINDER_DELIVERY_LOCK_TTL_MS,
      ]);
      if (acquired === 'OK') {
        return this.runWithAcquiredReminderDeliveryLock(
          redis,
          lockKey,
          token,
          operation,
        );
      }
      if (Date.now() >= deadline) return { acquired: false };
      await new Promise<void>((resolve) =>
        setTimeout(resolve, REMINDER_FAILURE_HANDLER_LOCK_POLL_MS),
      );
    }
  }

  private async runWithAcquiredReminderDeliveryLock<T>(
    redis: IRedisClient,
    lockKey: string,
    token: string,
    operation: () => Promise<T>,
  ): Promise<ReminderDeliveryLockResult<T>> {
    let leaseLost = false;
    let renewal: Promise<void> | undefined;
    const renewalTimer = setInterval(() => {
      if (renewal) return;
      renewal = redis
        .runCommand(RENEW_LOCK_COMMAND, [
          lockKey,
          token,
          REMINDER_DELIVERY_LOCK_TTL_MS,
        ])
        .then((result) => {
          if (Number(result) !== 1) leaseLost = true;
        })
        .catch(() => {
          leaseLost = true;
        })
        .finally(() => {
          renewal = undefined;
        });
    }, REMINDER_DELIVERY_LOCK_RENEW_INTERVAL_MS);
    renewalTimer.unref();

    try {
      const value = await operation();
      if (renewal) await renewal;
      return { acquired: true, value, leaseLost };
    } finally {
      clearInterval(renewalTimer);
      if (renewal) await renewal;
      await redis
        .runCommand(RELEASE_LOCK_COMMAND, [lockKey, token])
        .catch(() => undefined);
    }
  }

  async isReminderJobFailureCurrent(
    jobId: string,
    attemptsMade: number,
  ): Promise<boolean> {
    const job = await this.queue.getJob(jobId);
    if (!job) return false;
    const state = await job.getState();
    return (
      state === 'failed' &&
      job.attemptsMade === attemptsMade &&
      attemptsMade >= (job.opts.attempts ?? 1)
    );
  }

  async recoverReminderDelivery(
    executionId: string,
  ): Promise<ReminderDeliveryRecoveryResult> {
    const lock = await this.runWithReminderDeliveryLock(executionId, () =>
      this.recoverReminderDeliveryWithLock(executionId),
    );
    return lock.acquired && !lock.leaseLost ? lock.value : 'IN_FLIGHT';
  }

  private async recoverReminderDeliveryWithLock(
    executionId: string,
  ): Promise<ReminderDeliveryRecoveryResult> {
    const [originalJob, fallbackJob] = await Promise.all([
      this.queue.getJob(executionId),
      this.queue.getJob(`${executionId}-resend-fallback`),
    ]);
    const jobs = [
      { job: fallbackJob, id: `${executionId}-resend-fallback` },
      { job: originalJob, id: executionId },
    ];
    const existingJobs = jobs.filter(
      (
        candidate,
      ): candidate is { job: NonNullable<typeof candidate.job>; id: string } =>
        candidate.job !== undefined,
    );
    if (existingJobs.length === 0) return 'MISSING';

    const states = await Promise.all(
      existingJobs.map((candidate) => candidate.job.getState()),
    );
    if (states.some(isInFlightState)) return 'IN_FLIGHT';
    if (states.includes('completed')) return 'COMPLETED';

    const failedJobIndex = states.indexOf('failed');
    if (failedJobIndex === -1) return 'IN_FLIGHT';
    const failedJob = existingJobs[failedJobIndex].job;
    if (
      failedJob.finishedOn === undefined ||
      Date.now() - failedJob.finishedOn < RECENT_FAILURE_GRACE_MS
    ) {
      return 'IN_FLIGHT';
    }
    if (failedJob.attemptsMade !== failedJob.opts.attempts) {
      return 'EXHAUSTED';
    }

    try {
      await failedJob.retry('failed');
      return 'RETRIED';
    } catch (error) {
      const currentJob = await this.queue.getJob(
        existingJobs[failedJobIndex].id,
      );
      if (!currentJob) return 'MISSING';
      const currentState = await currentJob.getState();
      if (isInFlightState(currentState)) return 'IN_FLIGHT';
      if (currentState === 'completed') return 'COMPLETED';
      if (currentState === 'failed' && isRetryStateConflict(error)) {
        return 'EXHAUSTED';
      }
      if (currentState === 'unknown' && isRetryStateConflict(error)) {
        return 'IN_FLIGHT';
      }
      throw error;
    }
  }

  async add(
    name: 'send-reminder-email',
    data: ReminderEmailJob,
    options: {
      jobId: string;
      attempts: number;
      backoff: { type: 'exponential'; delay: number };
    },
  ): Promise<void>;
  async add(
    name: 'send-auth-email',
    data: AuthEmailJob,
    options?: {
      attempts: number;
      backoff: { type: 'exponential'; delay: number };
    },
  ): Promise<void>;
  async add(
    name: 'send-owner-alert',
    data: OwnerAlertEmailJob,
    options?: {
      jobId?: string;
      attempts: number;
      backoff: { type: 'exponential'; delay: number };
    },
  ): Promise<void>;
  async add(
    name: string,
    data: ReminderEmailJob | AuthEmailJob | OwnerAlertEmailJob,
    options?: {
      jobId?: string;
      attempts?: number;
      backoff?: { type: 'exponential'; delay: number };
    },
  ): Promise<void> {
    await this.queue.add(name, data, options);
  }
}
