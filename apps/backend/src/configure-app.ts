import {
  BadRequestException,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ErrorCode } from './common/errors/error-code';
import { HttpExceptionFilter } from './common/errors/http-exception.filter';
import { JsonLogger } from './common/observability/json-logger.service';

/**
 * Global app setup (prefix + validation pipe) shared between the real
 * bootstrap (main.ts) and e2e/integration tests, so the two can't drift.
 */
export function configureApp(
  app: INestApplication,
  config?: ConfigService,
): void {
  app.enableCors({
    origin: config?.get<string>('CORS_ORIGIN') ?? 'http://localhost:5173',
    credentials: true,
  });
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'metrics'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      validationError: { target: false, value: false },
      exceptionFactory: (errors) =>
        new BadRequestException({
          statusCode: 400,
          errorCode: ErrorCode.VALIDATION_ERROR,
          message: 'Dữ liệu đầu vào không hợp lệ.',
          details: errors,
        }),
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter(app.get(JsonLogger)));
}
