import { applyDecorators } from '@nestjs/common';
import { ApiHeader, ApiResponse } from '@nestjs/swagger';
import { ErrorCode } from '../errors/error-code';
import { errorResponseSchema } from './api-error-response.decorator';

export function ApiIdempotencyKey(): MethodDecorator {
  return applyDecorators(
    ApiHeader({ name: 'Idempotency-Key', required: true }),
    ApiResponse({
      status: 409,
      description: ErrorCode.VALIDATION_ERROR,
      schema: errorResponseSchema(ErrorCode.VALIDATION_ERROR, 409),
    }),
  );
}
