import { CopilotRateLimitGuard } from './copilot-rate-limit.guard';

class TestableCopilotRateLimitGuard extends CopilotRateLimitGuard {
  track(req: Record<string, unknown>): Promise<string> {
    return this.getTracker(req);
  }
}

describe('CopilotRateLimitGuard', () => {
  it('tracks authenticated requests by user id', async () => {
    const guard = Object.create(
      TestableCopilotRateLimitGuard.prototype,
    ) as TestableCopilotRateLimitGuard;

    await expect(
      guard.track({ user: { userId: 'user-1' }, ip: '203.0.113.10' }),
    ).resolves.toBe('copilot:user-1');
  });
});
