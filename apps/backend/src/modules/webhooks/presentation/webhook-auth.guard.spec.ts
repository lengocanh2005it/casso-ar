import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { WebhookAuthGuard } from './webhook-auth.guard';

function fakeContext(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('WebhookAuthGuard', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('throws if CASSO_WEBHOOK_CLIENT_ID is missing', () => {
    delete process.env.CASSO_WEBHOOK_CLIENT_ID;
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'secret';
    const guard = new WebhookAuthGuard();
    expect(() =>
      guard.canActivate(
        fakeContext({ 'x-client-id': 'any', 'x-secret-key': 'any' }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('throws if CASSO_WEBHOOK_SECRET_KEY is missing', () => {
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'client';
    delete process.env.CASSO_WEBHOOK_SECRET_KEY;
    const guard = new WebhookAuthGuard();
    expect(() =>
      guard.canActivate(
        fakeContext({ 'x-client-id': 'any', 'x-secret-key': 'any' }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('throws if both env vars are empty strings', () => {
    process.env.CASSO_WEBHOOK_CLIENT_ID = '';
    process.env.CASSO_WEBHOOK_SECRET_KEY = '';
    const guard = new WebhookAuthGuard();
    expect(() =>
      guard.canActivate(fakeContext({ 'x-client-id': '', 'x-secret-key': '' })),
    ).toThrow(UnauthorizedException);
  });

  it('rejects wrong credentials even when env vars are set', () => {
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'real-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'real-secret';
    const guard = new WebhookAuthGuard();
    expect(() =>
      guard.canActivate(
        fakeContext({ 'x-client-id': 'wrong', 'x-secret-key': 'wrong' }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('passes with correct credentials', () => {
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'real-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'real-secret';
    const guard = new WebhookAuthGuard();
    expect(
      guard.canActivate(
        fakeContext({
          'x-client-id': 'real-client',
          'x-secret-key': 'real-secret',
        }),
      ),
    ).toBe(true);
  });

  it('rejects if headers are missing', () => {
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'secret';
    const guard = new WebhookAuthGuard();
    expect(() => guard.canActivate(fakeContext({}))).toThrow(
      UnauthorizedException,
    );
  });
});
