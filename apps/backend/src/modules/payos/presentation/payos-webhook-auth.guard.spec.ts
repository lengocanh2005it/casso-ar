import { createHmac } from 'node:crypto';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { PayosWebhookAuthGuard } from './payos-webhook-auth.guard';

function signData(data: Record<string, unknown>, checksumKey: string): string {
  const sorted = Object.keys(data).sort();
  const query = sorted.map((k) => `${k}=${data[k] ?? ''}`).join('&');
  return createHmac('sha256', checksumKey).update(query).digest('hex');
}

function fakeContext(body: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ body }) }),
  } as unknown as ExecutionContext;
}

describe('PayosWebhookAuthGuard', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('throws if PAYOS_CHECKSUM_KEY is missing', () => {
    delete process.env.PAYOS_CHECKSUM_KEY;
    const guard = new PayosWebhookAuthGuard();
    expect(() =>
      guard.canActivate(
        fakeContext({ data: { orderCode: 1 }, signature: 'x' }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('passes when the signature matches the sorted-key HMAC of data', () => {
    process.env.PAYOS_CHECKSUM_KEY = 'test-checksum-key';
    const data = { orderCode: 1001, amount: 299000, code: '00' };
    const signature = signData(data, 'test-checksum-key');
    const guard = new PayosWebhookAuthGuard();
    expect(guard.canActivate(fakeContext({ data, signature }))).toBe(true);
  });

  it('rejects a tampered payload whose signature no longer matches', () => {
    process.env.PAYOS_CHECKSUM_KEY = 'test-checksum-key';
    const data = { orderCode: 1001, amount: 299000, code: '00' };
    const signature = signData(data, 'test-checksum-key');
    const guard = new PayosWebhookAuthGuard();
    expect(() =>
      guard.canActivate(
        fakeContext({ data: { ...data, amount: 1 }, signature }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a missing signature field', () => {
    process.env.PAYOS_CHECKSUM_KEY = 'test-checksum-key';
    const guard = new PayosWebhookAuthGuard();
    expect(() =>
      guard.canActivate(fakeContext({ data: { orderCode: 1 } })),
    ).toThrow(UnauthorizedException);
  });
});
