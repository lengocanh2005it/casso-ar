import type { ErrorCode } from './error-code';

export class AppError extends Error {
  constructor(
    public readonly errorCode: ErrorCode,
    message: string,
    public readonly details?: unknown,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AppError';
  }

  static withCause(
    cause: unknown,
    errorCode: ErrorCode,
    message: string,
    details?: unknown,
  ): AppError {
    return new AppError(errorCode, message, details, { cause });
  }
}
