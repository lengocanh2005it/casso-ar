import { applyDecorators } from '@nestjs/common';
import { ApiHeader, ApiResponse } from '@nestjs/swagger';
import { ErrorCode } from '../errors/error-code';
import { IDEMPOTENCY_KEY_MISSING_STATUS } from '../errors/status-by-error-code';
import { errorResponseSchema } from './api-error-response.decorator';

export function ApiIdempotencyKey(): MethodDecorator {
  return applyDecorators(
    ApiHeader({ name: 'Idempotency-Key', required: true }),
    ApiResponse({
      status: IDEMPOTENCY_KEY_MISSING_STATUS,
      description: ErrorCode.VALIDATION_ERROR,
      schema: errorResponseSchema(
        ErrorCode.VALIDATION_ERROR,
        IDEMPOTENCY_KEY_MISSING_STATUS,
      ),
    }),
  );
}
