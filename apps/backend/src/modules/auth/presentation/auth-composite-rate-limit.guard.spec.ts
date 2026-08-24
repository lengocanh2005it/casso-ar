import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { AuthCompositeRateLimitGuard } from './auth-composite-rate-limit.guard';

function buildContext(ip = '203.0.113.5') {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ ip }),
      getResponse: () => ({ header: jest.fn() }),
    }),
    getClass: () => ({ name: 'TestController' }),
    getHandler: () => ({ name: 'testHandler' }),
  } as unknown as ExecutionContext;
}

function buildGuard(redis: {
  get: jest.Mock;
  incr: jest.Mock;
  expire: jest.Mock;
}) {
  const options = { throttlers: [] };
  const storageService = {} as ThrottlerStorage;
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  return new AuthCompositeRateLimitGuard(
    options,
    storageService,
    reflector,
    redis as unknown as Redis,
  );
}

describe('AuthCompositeRateLimitGuard escalation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows the request through when there is no escalation record', async () => {
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      incr: jest.fn(),
      expire: jest.fn(),
    };
    const guard = buildGuard(redis);
    jest.spyOn(ThrottlerGuard.prototype, 'canActivate').mockResolvedValue(true);

    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it('rejects immediately when the IP is already escalated', async () => {
    const redis = {
      get: jest.fn().mockResolvedValue('3'),
      incr: jest.fn(),
      expire: jest.fn(),
    };
    const guard = buildGuard(redis);

    await expect(guard.canActivate(buildContext())).rejects.toBeInstanceOf(
      ThrottlerException,
    );
  });

  it('records a violation and keeps the 1-hour counting window when a throttler rejects and the threshold is not yet reached', async () => {
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn(),
    };
    const guard = buildGuard(redis);
    jest
      .spyOn(ThrottlerGuard.prototype, 'canActivate')
      .mockRejectedValue(new ThrottlerException());

    await expect(guard.canActivate(buildContext())).rejects.toBeInstanceOf(
      ThrottlerException,
    );
    expect(redis.incr).toHaveBeenCalledWith('abuse-escalation:203.0.113.5');
    expect(redis.expire).toHaveBeenCalledWith(
      'abuse-escalation:203.0.113.5',
      60 * 60,
    );
  });

  it('switches to the shorter lockout TTL once the violation threshold is reached', async () => {
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      incr: jest.fn().mockResolvedValue(3),
      expire: jest.fn(),
    };
    const guard = buildGuard(redis);
    jest
      .spyOn(ThrottlerGuard.prototype, 'canActivate')
      .mockRejectedValue(new ThrottlerException());

    await expect(guard.canActivate(buildContext())).rejects.toBeInstanceOf(
      ThrottlerException,
    );
    expect(redis.expire).toHaveBeenCalledWith(
      'abuse-escalation:203.0.113.5',
      15 * 60,
    );
  });

  it('does not touch the escalation counter for non-throttling errors', async () => {
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      incr: jest.fn(),
      expire: jest.fn(),
    };
    const guard = buildGuard(redis);
    jest
      .spyOn(ThrottlerGuard.prototype, 'canActivate')
      .mockRejectedValue(new Error('unrelated failure'));

    await expect(guard.canActivate(buildContext())).rejects.toThrow(
      'unrelated failure',
    );
    expect(redis.incr).not.toHaveBeenCalled();
  });
});
