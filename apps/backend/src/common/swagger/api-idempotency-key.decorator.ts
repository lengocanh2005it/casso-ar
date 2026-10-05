import { applyDecorators } from '@nestjs/common';
import { ApiHeader, ApiResponse } from '@nestjs/swagger';
import { ErrorCode } from '../errors/error-code';
import {
  IDEMPOTENCY_KEY_MISSING_STATUS,
  STATUS_BY_ERROR_CODE,
} from '../errors/status-by-error-code';
import {
  API_ERROR_CODES_METADATA,
  errorResponseSchema,
} from './api-error-response.decorator';

export function ApiIdempotencyKey(): MethodDecorator {
  const header = ApiHeader({ name: 'Idempotency-Key', required: true });

  return (target, propertyKey, descriptor) => {
    if (!descriptor?.value) return;

    const errorCodes = Reflect.getMetadata(
      API_ERROR_CODES_METADATA,
      descriptor.value,
    ) as ErrorCode[] | undefined;
    const existingConflictCodes = (errorCodes ?? []).filter(
      (code) =>
        (STATUS_BY_ERROR_CODE[code] ?? 500) === IDEMPOTENCY_KEY_MISSING_STATUS,
    );
    const response = ApiResponse({
      status: IDEMPOTENCY_KEY_MISSING_STATUS,
      description: ErrorCode.VALIDATION_ERROR,
      schema: errorResponseSchema(
        ErrorCode.VALIDATION_ERROR,
        IDEMPOTENCY_KEY_MISSING_STATUS,
        existingConflictCodes,
      ),
    });

    applyDecorators(header, response)(target, propertyKey, descriptor);
  };
}
