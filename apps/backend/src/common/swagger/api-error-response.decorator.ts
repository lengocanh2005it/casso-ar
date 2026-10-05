import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorCode } from '../errors/error-code';
import { STATUS_BY_ERROR_CODE } from '../errors/status-by-error-code';

export function errorResponseSchema(
  errorCode: ErrorCode,
  statusOverride?: number,
) {
  return {
    type: 'object' as const,
    required: ['statusCode', 'errorCode', 'message'],
    properties: {
      statusCode: {
        type: 'number' as const,
        example: statusOverride ?? STATUS_BY_ERROR_CODE[errorCode] ?? 500,
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

  // One @ApiResponse per HTTP status (OpenAPI allows a single response per
  // status). All codes that map to the same status are listed in the
  // description; the schema example uses the first code of the group.
  const byStatus = new Map<number, ErrorCode[]>();
  for (const code of errorCodes) {
    const status = statusFor(code);
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  }

  return applyDecorators(
    ...[...byStatus.entries()].map(([status, codes]) =>
      ApiResponse({
        status,
        description: codes.join(' | '),
        schema: errorResponseSchema(codes[0]),
      }),
    ),
  );
}
