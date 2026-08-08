import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class StructuredLogger {
  private readonly logger = new Logger(StructuredLogger.name);

  error(context: Record<string, unknown>): void {
    this.logger.error(context);
  }
}
