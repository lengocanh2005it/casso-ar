import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { AppError } from './app-error';
import { ErrorCode } from './error-code';

interface ErrorEnvelope {
  statusCode: number;
  errorCode: string;
  message: string;
  details?: unknown;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    const envelope = this.toEnvelope(exception);
    response.status(envelope.statusCode).json(envelope);
  }

  private toEnvelope(exception: unknown): ErrorEnvelope {
    if (exception instanceof AppError) {
      return {
        statusCode: this.statusForErrorCode(exception.errorCode),
        errorCode: exception.errorCode,
        message: exception.message,
        ...(exception.details === undefined
          ? {}
          : { details: exception.details }),
      };
    }
    if (!(exception instanceof HttpException)) {
      return {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.',
      };
    }

    const statusCode = exception.getStatus();
    const body = exception.getResponse();
    if (typeof body === 'object' && body !== null) {
      const data = body as Record<string, unknown>;
      if (
        this.isErrorCode(data.errorCode) &&
        typeof data.message === 'string'
      ) {
        return {
          statusCode,
          errorCode: data.errorCode,
          message: data.message,
          ...(data.details === undefined ? {} : { details: data.details }),
        };
      }
      const message = Array.isArray(data.message)
        ? 'Dữ liệu đầu vào không hợp lệ.'
        : this.defaultMessageForStatus(statusCode);
      return {
        statusCode,
        errorCode: this.codeForStatus(statusCode),
        message,
        ...(Array.isArray(data.message) ? { details: data.message } : {}),
      };
    }

    return {
      statusCode,
      errorCode: this.codeForStatus(statusCode),
      message: this.defaultMessageForStatus(statusCode),
    };
  }

  private codeForStatus(statusCode: number): ErrorCode {
    if (statusCode === 400) return ErrorCode.VALIDATION_ERROR;
    if (statusCode === 401) return ErrorCode.UNAUTHORIZED;
    if (statusCode === 403) return ErrorCode.FORBIDDEN;
    if (statusCode === 404) return ErrorCode.NOT_FOUND;
    if (statusCode === 409) return ErrorCode.CONFLICT;
    if (statusCode === 413) return ErrorCode.FILE_TOO_LARGE;
    if (statusCode === 429) return ErrorCode.RATE_LIMIT_EXCEEDED;
    return ErrorCode.INTERNAL_SERVER_ERROR;
  }

  private statusForErrorCode(errorCode: ErrorCode): number {
    // Kept in sync with the "API Error Codes" table in AGENTS.md. Every
    // ErrorCode with a documented HTTP status there must have an entry here;
    // only codes with no documented status (e.g. INTERNAL_SERVER_ERROR) may
    // rely on the `?? 500` fallback. See http-exception.filter.spec.ts for
    // the regression guard.
    const statusByErrorCode: Partial<Record<ErrorCode, number>> = {
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
      [ErrorCode.IDEMPOTENCY_KEY_REUSED]: 409,
    };
    return statusByErrorCode[errorCode] ?? 500;
  }

  private defaultMessageForStatus(statusCode: number): string {
    if (statusCode === 400) return 'Dữ liệu đầu vào không hợp lệ.';
    if (statusCode === 401)
      return 'Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.';
    if (statusCode === 403) return 'Bạn không có quyền thực hiện thao tác này.';
    if (statusCode === 404) return 'Không tìm thấy tài nguyên.';
    if (statusCode === 409) return 'Dữ liệu đang xung đột.';
    if (statusCode === 413) return 'Tệp tải lên vượt quá kích thước cho phép.';
    if (statusCode === 429)
      return 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.';
    return 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.';
  }

  private isErrorCode(value: unknown): value is ErrorCode {
    return (
      typeof value === 'string' &&
      (Object.values(ErrorCode) as string[]).includes(value)
    );
  }
}
