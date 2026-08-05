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
    if (statusCode === 429) return ErrorCode.RATE_LIMIT_EXCEEDED;
    return ErrorCode.INTERNAL_SERVER_ERROR;
  }

  private statusForErrorCode(errorCode: ErrorCode): number {
    const statusByErrorCode: Partial<Record<ErrorCode, number>> = {
      [ErrorCode.VALIDATION_ERROR]: 400,
      [ErrorCode.UNAUTHORIZED]: 401,
      [ErrorCode.FORBIDDEN]: 403,
      [ErrorCode.NOT_FOUND]: 404,
      [ErrorCode.RECEIVABLE_NOT_FOUND]: 404,
      [ErrorCode.CONFLICT]: 409,
      [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
      [ErrorCode.PLAN_LIMIT_EXCEEDED]: 402,
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
