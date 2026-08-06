import type { ExecutionContext } from '@nestjs/common';
import { WebhookAuthGuard } from './webhook-auth.guard';

function context(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('WebhookAuthGuard', () => {
  beforeEach(() => {
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'client-1';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'secret-1';
  });

  it('accepts matching credentials and rejects wrong or missing headers', () => {
    const guard = new WebhookAuthGuard();
    expect(
      guard.canActivate(
        context({ 'x-client-id': 'client-1', 'x-secret-key': 'secret-1' }),
      ),
    ).toBe(true);
    expect(() =>
      guard.canActivate(
        context({ 'x-client-id': 'client-1', 'x-secret-key': 'wrong' }),
      ),
    ).toThrow();
    expect(() => guard.canActivate(context({}))).toThrow();
  });
});
