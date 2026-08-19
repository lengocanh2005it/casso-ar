import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { WebhookAuthGuard } from './webhook-auth.guard';

function fakeContext(ip: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ ip }),
    }),
  } as unknown as ExecutionContext;
}

describe('WebhookAuthGuard', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('passes when the request IP is in the allowlist', () => {
    process.env.CAS_ID_WEBHOOK_IP_ALLOWLIST = '20.2.69.168';
    const guard = new WebhookAuthGuard();
    expect(guard.canActivate(fakeContext('20.2.69.168'))).toBe(true);
  });

  it('rejects when the request IP is not in the allowlist', () => {
    process.env.CAS_ID_WEBHOOK_IP_ALLOWLIST = '20.2.69.168';
    const guard = new WebhookAuthGuard();
    expect(() => guard.canActivate(fakeContext('1.2.3.4'))).toThrow(
      UnauthorizedException,
    );
  });

  it('fails closed when the allowlist env var is unset', () => {
    delete process.env.CAS_ID_WEBHOOK_IP_ALLOWLIST;
    const guard = new WebhookAuthGuard();
    expect(() => guard.canActivate(fakeContext('20.2.69.168'))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when the request has no IP', () => {
    process.env.CAS_ID_WEBHOOK_IP_ALLOWLIST = '20.2.69.168';
    const guard = new WebhookAuthGuard();
    expect(() => guard.canActivate(fakeContext(undefined))).toThrow(
      UnauthorizedException,
    );
  });
});
