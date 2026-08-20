import {
  type CallHandler,
  type ExecutionContext,
  NotFoundException,
} from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-code';
import { HttpLoggingInterceptor } from './http-logging.interceptor';
import type { JsonLogger } from './json-logger.service';

function buildContext(statusCode: number, path = '/payments/123') {
  const response = { statusCode };
  const request = {
    method: 'GET',
    route: { path: '/payments/:id' },
    path,
    ip: '127.0.0.1',
    get: (name: string) =>
      name.toLowerCase() === 'user-agent' ? 'test-agent' : undefined,
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

describe('HttpLoggingInterceptor', () => {
  const originalThreshold = process.env.SLOW_REQUEST_THRESHOLD_MS;

  afterEach(() => {
    if (originalThreshold === undefined) {
      delete process.env.SLOW_REQUEST_THRESHOLD_MS;
    } else {
      process.env.SLOW_REQUEST_THRESHOLD_MS = originalThreshold;
    }
  });

  it('logs a successful request with its route and request metadata', () => {
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const interceptor = new HttpLoggingInterceptor(
      logger as unknown as JsonLogger,
    );
    const next: CallHandler = { handle: () => of('ok') };

    interceptor.intercept(buildContext(200), next).subscribe();

    expect(logger.log).toHaveBeenCalledWith(
      {
        method: 'GET',
        path: '/payments/:id',
        statusCode: 200,
        durationMs: expect.any(Number),
        ip: '127.0.0.1',
        userAgent: 'test-agent',
        message: 'GET /payments/:id 200',
      },
      HttpLoggingInterceptor.name,
    );
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('uses warn for client errors and error for server errors', () => {
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const interceptor = new HttpLoggingInterceptor(
      logger as unknown as JsonLogger,
    );

    interceptor
      .intercept(buildContext(404), { handle: () => of(null) })
      .subscribe();
    interceptor
      .intercept(buildContext(500), { handle: () => of(null) })
      .subscribe();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 }),
      HttpLoggingInterceptor.name,
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
      undefined,
      HttpLoggingInterceptor.name,
    );
  });

  it('logs a server error when the request handler throws', () => {
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const interceptor = new HttpLoggingInterceptor(
      logger as unknown as JsonLogger,
    );

    interceptor
      .intercept(buildContext(200), {
        handle: () => throwError(() => new Error('boom')),
      })
      .subscribe({ error: () => undefined });

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
      undefined,
      HttpLoggingInterceptor.name,
    );
  });

  it('uses the HTTP status from a thrown HTTP exception', () => {
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const interceptor = new HttpLoggingInterceptor(
      logger as unknown as JsonLogger,
    );

    interceptor
      .intercept(buildContext(200), {
        handle: () => throwError(() => new NotFoundException()),
      })
      .subscribe({ error: () => undefined });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 }),
      HttpLoggingInterceptor.name,
    );
  });

  it('uses the mapped status from a thrown AppError', () => {
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const interceptor = new HttpLoggingInterceptor(
      logger as unknown as JsonLogger,
    );

    interceptor
      .intercept(buildContext(200), {
        handle: () =>
          throwError(() => new AppError(ErrorCode.NOT_FOUND, 'missing')),
      })
      .subscribe({ error: () => undefined });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 }),
      HttpLoggingInterceptor.name,
    );
  });

  it('marks a request as slow and logs it at warn level', () => {
    process.env.SLOW_REQUEST_THRESHOLD_MS = '0';
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const interceptor = new HttpLoggingInterceptor(
      logger as unknown as JsonLogger,
    );

    interceptor
      .intercept(buildContext(200), { handle: () => of(null) })
      .subscribe();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 200, slow: true }),
      HttpLoggingInterceptor.name,
    );
  });

  it('falls back to the default slow threshold when configured value is invalid', () => {
    process.env.SLOW_REQUEST_THRESHOLD_MS = '-1';
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const interceptor = new HttpLoggingInterceptor(
      logger as unknown as JsonLogger,
    );

    interceptor
      .intercept(buildContext(200), { handle: () => of(null) })
      .subscribe();

    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 200 }),
      HttpLoggingInterceptor.name,
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('skips health, readiness, and metrics endpoints', () => {
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const interceptor = new HttpLoggingInterceptor(
      logger as unknown as JsonLogger,
    );

    for (const path of ['/health', '/ready', '/metrics', '/api/v1/health']) {
      interceptor
        .intercept(buildContext(200, path), { handle: () => of(null) })
        .subscribe();
    }

    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});
