import { MetricsTokenGuard } from './metrics-token.guard';

describe('MetricsTokenGuard', () => {
  const originalToken = process.env.METRICS_TOKEN;

  afterEach(() => {
    process.env.METRICS_TOKEN = originalToken;
  });

  const request = (authorization?: string) => ({
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
    }),
  });

  it('allows access when no token is configured (dev default)', () => {
    delete process.env.METRICS_TOKEN;
    const guard = new MetricsTokenGuard();
    expect(guard.canActivate(request() as never)).toBe(true);
  });

  it('rejects a missing or wrong token when configured', () => {
    process.env.METRICS_TOKEN = 'sekret';
    const guard = new MetricsTokenGuard();
    expect(() => guard.canActivate(request() as never)).toThrow(
      'Invalid metrics token',
    );
    expect(() => guard.canActivate(request('Bearer wrong') as never)).toThrow(
      'Invalid metrics token',
    );
  });

  it('allows the configured bearer token', () => {
    process.env.METRICS_TOKEN = 'sekret';
    const guard = new MetricsTokenGuard();
    expect(guard.canActivate(request('Bearer sekret') as never)).toBe(true);
  });
});
