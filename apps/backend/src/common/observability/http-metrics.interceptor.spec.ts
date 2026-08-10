import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { MetricsService } from './metrics.service';

describe('HttpMetricsInterceptor', () => {
  it('records duration with method, route, and response status_code', () => {
    const metrics = {
      observeHttpRequest: jest.fn(),
    } as unknown as MetricsService;
    const interceptor = new HttpMetricsInterceptor(metrics);

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          route: { path: '/health' },
        }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;

    const next: CallHandler = { handle: () => of('ok') };

    interceptor.intercept(context, next).subscribe();

    expect(metrics.observeHttpRequest).toHaveBeenCalledWith(
      'GET',
      '/health',
      200,
      expect.any(Number),
    );
  });

  it('records duration when the request handler errors', () => {
    const metrics = {
      observeHttpRequest: jest.fn(),
    } as unknown as MetricsService;
    const interceptor = new HttpMetricsInterceptor(metrics);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          route: { path: '/missing' },
        }),
        getResponse: () => ({ statusCode: 500 }),
      }),
    } as unknown as ExecutionContext;
    const next: CallHandler = {
      handle: () => throwError(() => new Error('not found')),
    };

    interceptor.intercept(context, next).subscribe({ error: () => undefined });

    expect(metrics.observeHttpRequest).toHaveBeenCalledWith(
      'GET',
      '/missing',
      500,
      expect.any(Number),
    );
  });
});
