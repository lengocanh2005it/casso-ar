import { SmtpConfigRateLimitGuard } from './smtp-config-rate-limit.guard';

class TestableSmtpConfigRateLimitGuard extends SmtpConfigRateLimitGuard {
  track(req: Record<string, unknown>): Promise<string> {
    return this.getTracker(req);
  }
}

describe('SmtpConfigRateLimitGuard', () => {
  it('tracks authenticated requests by organization and user', async () => {
    const guard = Object.create(
      TestableSmtpConfigRateLimitGuard.prototype,
    ) as TestableSmtpConfigRateLimitGuard;

    await expect(
      guard.track({
        user: { organizationId: 'org-1', userId: 'user-1' },
        ip: '203.0.113.10',
      }),
    ).resolves.toBe('smtp:org-1:user-1');
  });
});
