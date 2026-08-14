import { ErrorCode } from './error-code';
import { STATUS_BY_ERROR_CODE } from './status-by-error-code';

describe('STATUS_BY_ERROR_CODE', () => {
  it('maps every documented ErrorCode to its AGENTS.md HTTP status', () => {
    expect(STATUS_BY_ERROR_CODE[ErrorCode.VALIDATION_ERROR]).toBe(400);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.NOT_FOUND]).toBe(404);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.UNAUTHORIZED]).toBe(401);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.FORBIDDEN]).toBe(403);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.CONFLICT]).toBe(409);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.PLAN_LIMIT_EXCEEDED]).toBe(402);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.TENANT_MISMATCH]).toBe(403);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.ALLOCATION_EXCEEDS_REMAINING]).toBe(
      400,
    );
    expect(STATUS_BY_ERROR_CODE[ErrorCode.ALLOCATION_EXCEEDS_UNALLOCATED]).toBe(
      400,
    );
    expect(STATUS_BY_ERROR_CODE[ErrorCode.OPTIMISTIC_LOCK_CONFLICT]).toBe(409);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.PAYMENT_CUSTOMER_UNRESOLVED]).toBe(
      400,
    );
    expect(STATUS_BY_ERROR_CODE[ErrorCode.CUSTOMER_MISMATCH]).toBe(400);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.RECEIVABLE_NOT_FOUND]).toBe(404);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.PAYMENT_NOT_FOUND]).toBe(404);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.ALLOCATION_NOT_FOUND]).toBe(404);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.ALLOCATION_ALREADY_UNDONE]).toBe(409);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.DISPUTE_ALREADY_OPEN]).toBe(409);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.RECEIVABLE_HAS_PAYMENTS]).toBe(400);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.TEMPLATE_IN_USE]).toBe(409);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.EMAIL_SEND_FAILED]).toBe(500);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.SMTP_CONNECTION_FAILED]).toBe(400);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.IDEMPOTENCY_KEY_REUSED]).toBe(409);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.INVALID_PLAN_TRANSITION]).toBe(400);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.FILE_TOO_LARGE]).toBe(413);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.RATE_LIMIT_EXCEEDED]).toBe(429);
  });

  it('falls back to undefined for codes without a documented status', () => {
    expect(
      STATUS_BY_ERROR_CODE[ErrorCode.INTERNAL_SERVER_ERROR],
    ).toBeUndefined();
    expect(
      STATUS_BY_ERROR_CODE[ErrorCode.TOKEN_ENCRYPTION_FAILED],
    ).toBeUndefined();
  });
});
