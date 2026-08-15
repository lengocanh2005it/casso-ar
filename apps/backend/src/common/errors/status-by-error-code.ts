import { ErrorCode } from './error-code';

/**
 * Kept in sync with the "API Error Codes" table in AGENTS.md. Every ErrorCode
 * with a documented HTTP status there must have an entry here; codes with no
 * documented status may rely on the `?? 500` fallback at use sites.
 */
export const STATUS_BY_ERROR_CODE: Readonly<
  Partial<Record<ErrorCode, number>>
> = {
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.FILE_TOO_LARGE]: 413,
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
  [ErrorCode.TENANT_MISMATCH]: 403,
  [ErrorCode.PLAN_LIMIT_EXCEEDED]: 402,
  [ErrorCode.ALLOCATION_EXCEEDS_REMAINING]: 400,
  [ErrorCode.ALLOCATION_EXCEEDS_UNALLOCATED]: 400,
  [ErrorCode.OPTIMISTIC_LOCK_CONFLICT]: 409,
  [ErrorCode.PAYMENT_CUSTOMER_UNRESOLVED]: 400,
  [ErrorCode.CUSTOMER_MISMATCH]: 400,
  [ErrorCode.RECEIVABLE_NOT_FOUND]: 404,
  [ErrorCode.PAYMENT_NOT_FOUND]: 404,
  [ErrorCode.ALLOCATION_NOT_FOUND]: 404,
  [ErrorCode.ALLOCATION_ALREADY_UNDONE]: 409,
  [ErrorCode.DISPUTE_ALREADY_OPEN]: 409,
  [ErrorCode.RECEIVABLE_HAS_PAYMENTS]: 400,
  [ErrorCode.TEMPLATE_IN_USE]: 409,
  [ErrorCode.EMAIL_SEND_FAILED]: 500,
  [ErrorCode.SMTP_CONNECTION_FAILED]: 400,
  [ErrorCode.IDEMPOTENCY_KEY_REUSED]: 409,
  [ErrorCode.INVALID_PLAN_TRANSITION]: 400,
  [ErrorCode.ORGANIZATION_LOCKED]: 403,
  [ErrorCode.MEMBER_BLOCKED]: 403,
};
