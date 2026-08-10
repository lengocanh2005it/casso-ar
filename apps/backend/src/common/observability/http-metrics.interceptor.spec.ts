import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { MetricsService } from './metrics.service';

describe('HttpMetricsInterceptor', () => {
  it('records duration with method, route, and response status_code', (done) => {
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

    interceptor.intercept(context, next).subscribe(() => {
      expect(metrics.observeHttpRequest).toHaveBeenCalledWith(
        'GET',
        '/health',
        200,
        expect.any(Number),
      );
      done();
    });
  });
});
