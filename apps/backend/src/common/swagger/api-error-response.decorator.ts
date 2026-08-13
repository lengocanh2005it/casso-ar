import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorCode } from '../errors/error-code';
import { STATUS_BY_ERROR_CODE } from '../errors/status-by-error-code';

export function errorResponseSchema(errorCode: ErrorCode) {
  return {
    type: 'object' as const,
    required: ['statusCode', 'errorCode', 'message'],
    properties: {
      statusCode: {
        type: 'number' as const,
        example: STATUS_BY_ERROR_CODE[errorCode] ?? 500,
      },
      errorCode: { type: 'string' as const, example: errorCode },
      message: { type: 'string' as const },
      details: {},
    },
  };
}

export function ApiErrorResponse(...errorCodes: ErrorCode[]): MethodDecorator {
  const statusFor = (code: ErrorCode): number =>
    STATUS_BY_ERROR_CODE[code] ?? 500;
  const deduped = [
    ...new Map(errorCodes.map((code) => [statusFor(code), code])).values(),
  ];

  return applyDecorators(
    ...deduped.map((code) =>
      ApiResponse({
        status: statusFor(code),
        description: code,
        schema: errorResponseSchema(code),
      }),
    ),
  );
}
