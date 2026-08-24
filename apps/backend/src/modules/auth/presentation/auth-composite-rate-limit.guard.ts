import type { ExecutionContext } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type {
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerException,
  ThrottlerGuard,
} from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { RATE_LIMIT_REDIS_CLIENT } from '../../../common/rate-limiting/rate-limit-redis-client.provider';

const VIOLATION_THRESHOLD = 3;
const VIOLATION_WINDOW_SECONDS = 60 * 60;
const LOCKOUT_SECONDS = 15 * 60;

function escalationKeyFor(context: ExecutionContext): string {
  const req = context.switchToHttp().getRequest<Record<string, unknown>>();
  const ip = typeof req.ip === 'string' ? req.ip : 'unknown';
  return `abuse-escalation:${ip}`;
}

@Injectable()
export class AuthCompositeRateLimitGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    @Inject(RATE_LIMIT_REDIS_CLIENT) private readonly redis: Redis,
  ) {
    super(options, storageService, reflector);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const key = escalationKeyFor(context);
    const violations = Number((await this.redis.get(key)) ?? 0);
    if (violations >= VIOLATION_THRESHOLD) {
      throw new ThrottlerException();
    }

    try {
      return await super.canActivate(context);
    } catch (error) {
      if (error instanceof ThrottlerException) {
        const count = await this.redis.incr(key);
        await this.redis.expire(
          key,
          count >= VIOLATION_THRESHOLD
            ? LOCKOUT_SECONDS
            : VIOLATION_WINDOW_SECONDS,
        );
      }
      throw error;
    }
  }
}
