import {
  BadRequestException,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ErrorCode } from './common/errors/error-code';
import { HttpExceptionFilter } from './common/errors/http-exception.filter';

/**
 * Global app setup (prefix + validation pipe) shared between the real
 * bootstrap (main.ts) and e2e/integration tests, so the two can't drift.
 */
export function configureApp(app: INestApplication): void {
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
  app.useGlobalFilters(new HttpExceptionFilter());
}
