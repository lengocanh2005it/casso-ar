import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { Redis } from 'ioredis';
import { RATE_LIMIT_REDIS_CLIENT } from '../../../common/rate-limiting/rate-limit-redis-client.provider';
import type {
  AiMatchingGuardInput,
  AiMatchingGuardResult,
  AiMatchingGuardSkipReason,
  IAiMatchingGuard,
} from '../application/ai-matching-guard.port';

const TIMEZONE = 'Asia/Ho_Chi_Minh';
const DEFAULT_DAILY_LIMIT = 100;
const DEFAULT_CONCURRENCY_LIMIT = 2;
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_DAILY_LIMIT = 1_000;
const MAX_CONCURRENCY_LIMIT = 10;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 10_000;
const CLEANUP_BUFFER_MS = 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

const RELEASE_LOCK_SCRIPT = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
`;

interface AiMatchingGuardSettings {
  enabled: boolean;
  dailyLimit: number;
  concurrencyLimit: number;
  timeoutMs: number;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

function settingsFrom(config: ConfigService): AiMatchingGuardSettings {
  return {
    enabled: config.get<string>('AI_MATCHING_ENABLED', 'false') === 'true',
    dailyLimit: boundedInteger(
      config.get<string>('AI_MATCHING_DAILY_LIMIT'),
      DEFAULT_DAILY_LIMIT,
      1,
      MAX_DAILY_LIMIT,
    ),
    concurrencyLimit: boundedInteger(
      config.get<string>('AI_MATCHING_CONCURRENCY'),
      DEFAULT_CONCURRENCY_LIMIT,
      1,
      MAX_CONCURRENCY_LIMIT,
    ),
    timeoutMs: boundedInteger(
      config.get<string>('AI_MATCHING_TIMEOUT_MS'),
      DEFAULT_TIMEOUT_MS,
      MIN_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
    ),
  };
}

function hcmDayKey(now: Date): string {
  return formatInTimeZone(now, TIMEZONE, 'yyyy-MM-dd');
}

function millisecondsUntilNextHcmMidnight(now: Date): number {
  const todayMidnight = fromZonedTime(
    `${hcmDayKey(now)}T00:00:00.000`,
    TIMEZONE,
  );
  return Math.max(1, todayMidnight.getTime() + DAY_MS - now.getTime());
}

@Injectable()
export class RedisAiMatchingGuard implements IAiMatchingGuard {
  private readonly settings: AiMatchingGuardSettings;
  private readonly lockTtlMs: number;

  constructor(
    @Inject(RATE_LIMIT_REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService,
  ) {
    this.settings = settingsFrom(config);
    this.lockTtlMs = Math.max(
      MIN_TIMEOUT_MS,
      this.settings.timeoutMs * 2 + CLEANUP_BUFFER_MS,
    );
  }

  async run<T>(
    input: AiMatchingGuardInput,
    operation: () => Promise<T>,
  ): Promise<AiMatchingGuardResult<T>> {
    if (!this.settings.enabled) return this.skipped('feature-disabled');

    const lockKey = `ai-matching:lock:${input.webhookInboxId}`;
    const inFlightKey = `ai-matching:in-flight:${input.organizationId}`;
    const now = new Date();
    const attemptKey = `ai-matching:attempts:${input.organizationId}:${hcmDayKey(now)}`;
    const lockToken = randomUUID();
    let lockAcquired = false;
    let concurrencyAcquired = false;

    try {
      try {
        const lock = await this.redis.set(
          lockKey,
          lockToken,
          'PX',
          this.lockTtlMs,
          'NX',
        );
        if (lock !== 'OK') return this.skipped('duplicate');
        lockAcquired = true;

        const inFlight = await this.redis.incr(inFlightKey);
        concurrencyAcquired = true;
        await this.redis.pexpire(inFlightKey, this.lockTtlMs);
        if (inFlight > this.settings.concurrencyLimit) {
          await this.redis.decr(inFlightKey);
          concurrencyAcquired = false;
          return this.skipped('concurrency-limit');
        }

        const attempts = await this.redis.incr(attemptKey);
        if (attempts === 1) {
          await this.redis.pexpire(
            attemptKey,
            millisecondsUntilNextHcmMidnight(now),
          );
        }
        if (attempts > this.settings.dailyLimit) {
          return this.skipped('daily-limit');
        }
      } catch {
        return this.skipped('redis-unavailable');
      }

      return { outcome: 'executed', value: await operation() };
    } finally {
      if (concurrencyAcquired) await this.releaseConcurrency(inFlightKey);
      if (lockAcquired) await this.releaseLock(lockKey, lockToken);
    }
  }

  private skipped<T>(
    reason: AiMatchingGuardSkipReason,
  ): AiMatchingGuardResult<T> {
    return { outcome: 'skipped', reason };
  }

  private async releaseConcurrency(key: string): Promise<void> {
    try {
      await this.redis.decr(key);
    } catch {
      // The counter TTL bounds a crashed worker or Redis cleanup failure.
    }
  }

  private async releaseLock(key: string, token: string): Promise<void> {
    try {
      await this.redis.eval(RELEASE_LOCK_SCRIPT, 1, key, token);
    } catch {
      // The lock TTL bounds a crashed worker or Redis cleanup failure.
    }
  }
}
