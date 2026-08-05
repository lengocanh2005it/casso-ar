import type { ErrorCode } from './error-code';

export class AuthError extends Error {
  constructor(
    readonly statusCode: number,
    readonly errorCode: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
