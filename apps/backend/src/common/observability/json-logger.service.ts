import { Injectable, type LoggerService, type LogLevel } from '@nestjs/common';
import { TenantContextService } from '../tenancy/tenant-context';
import { RequestIdStore } from './request-id.store';

interface LogFields {
  [key: string]: unknown;
}

function isLogFields(value: unknown): value is LogFields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class JsonLogger implements LoggerService {
  constructor(
    private readonly requestIdStore: RequestIdStore,
    private readonly tenantContext: TenantContextService,
  ) {}

  log(message: unknown, context?: string): void {
    this.write('log', message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', message, context, trace);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }

  fatal(message: unknown, context?: string): void {
    this.write('fatal', message, context);
  }

  private write(
    level: LogLevel,
    message: unknown,
    context?: string,
    trace?: string,
  ): void {
    const user = this.tenantContext.getCurrentUser();
    const fields = this.toFields(message);
    const entry = {
      ...fields,
      timestamp: new Date().toISOString(),
      level,
      message: this.toMessage(message, fields),
      context: context ?? 'Application',
      requestId: this.requestIdStore.getRequestId(),
      organizationId: user?.organizationId,
      userId: user?.userId,
      trace,
    };

    process.stdout.write(`${JSON.stringify(entry)}\n`);
  }

  private toFields(message: unknown): LogFields {
    return isLogFields(message) ? message : {};
  }

  private toMessage(message: unknown, fields: LogFields): string {
    if (typeof fields.message === 'string') {
      return fields.message;
    }
    if (typeof message === 'string') {
      return message;
    }
    return String(message);
  }
}
