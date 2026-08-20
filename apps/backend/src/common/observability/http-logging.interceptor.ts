import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AppError } from '../errors/app-error';
import { STATUS_BY_ERROR_CODE } from '../errors/status-by-error-code';
import { JsonLogger } from './json-logger.service';

const DEFAULT_SLOW_REQUEST_THRESHOLD_MS = 2_000;
const SKIPPED_PATHS = new Set(['/health', '/ready', '/metrics']);

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly slowRequestThresholdMs: number;

  constructor(private readonly logger: JsonLogger) {
    this.slowRequestThresholdMs = this.getSlowRequestThresholdMs();
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    if (this.shouldSkip(request)) return next.handle();

    const response = context.switchToHttp().getResponse<Response>();
    const start = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        complete: () => this.logRequest(request, response, start),
        error: (exception: unknown) =>
          this.logRequest(
            request,
            response,
            start,
            this.getErrorStatusCode(exception, response),
          ),
      }),
    );
  }

  private logRequest(
    request: Request,
    response: Response,
    start: bigint,
    statusCodeOverride?: number,
  ): void {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const statusCode = statusCodeOverride ?? response.statusCode ?? 200;
    const slow = durationMs > this.slowRequestThresholdMs;
    const method = request.method;
    const path = this.getPath(request);
    const fields = {
      method,
      path,
      statusCode,
      durationMs: Math.round(durationMs),
      ip: request.ip,
      userAgent: request.get('user-agent'),
      ...(slow ? { slow: true } : {}),
      message: `${method} ${path} ${statusCode}`,
    };

    if (statusCode >= 500) {
      this.logger.error(fields, undefined, HttpLoggingInterceptor.name);
    } else if (statusCode >= 400 || slow) {
      this.logger.warn(fields, HttpLoggingInterceptor.name);
    } else {
      this.logger.log(fields, HttpLoggingInterceptor.name);
    }
  }

  private getErrorStatusCode(exception: unknown, response: Response): number {
    if (exception instanceof AppError) {
      return STATUS_BY_ERROR_CODE[exception.errorCode] ?? 500;
    }
    if (exception instanceof HttpException) return exception.getStatus();
    return response.statusCode >= 400 ? response.statusCode : 500;
  }

  private shouldSkip(request: Request): boolean {
    const path = request.path ?? request.url ?? '';
    const withoutPrefix = path.replace(/^\/api\/v1(?=\/|$)/, '');
    return SKIPPED_PATHS.has(withoutPrefix);
  }

  private getPath(request: Request): string {
    const routePath = request.route?.path;
    return typeof routePath === 'string' ? routePath : request.path;
  }

  private getSlowRequestThresholdMs(): number {
    const configured = (process.env.SLOW_REQUEST_THRESHOLD_MS ?? '').trim();
    if (!configured) return DEFAULT_SLOW_REQUEST_THRESHOLD_MS;

    const threshold = Number(configured);
    return Number.isFinite(threshold) && threshold >= 0
      ? threshold
      : DEFAULT_SLOW_REQUEST_THRESHOLD_MS;
  }
}
