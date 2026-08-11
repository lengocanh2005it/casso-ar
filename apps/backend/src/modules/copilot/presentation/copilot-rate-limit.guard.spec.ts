import type { ExecutionContext } from '@nestjs/common';
import { CopilotRateLimitGuard } from './copilot-rate-limit.guard';

const handler = () => undefined;
class TestController {}

function createContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ header: jest.fn() }),
    }),
  } as unknown as ExecutionContext;
}

describe('CopilotRateLimitGuard', () => {
  it('shares a rate-limit bucket for the same user across IP changes', async () => {
    const increment = jest.fn().mockResolvedValue({
      totalHits: 1,
      timeToExpire: 60_000,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    const guard = new CopilotRateLimitGuard(
      [{ name: 'default', limit: 30, ttl: 60_000 }],
      { increment } as any,
      { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as any,
    );
    await guard.onModuleInit();

    await guard.canActivate(
      createContext({ user: { userId: 'user-1' }, ip: '203.0.113.10' }),
    );
    await guard.canActivate(
      createContext({ user: { userId: 'user-1' }, ip: '203.0.113.11' }),
    );

    expect(increment.mock.calls[1][0]).toBe(increment.mock.calls[0][0]);
  });
});
