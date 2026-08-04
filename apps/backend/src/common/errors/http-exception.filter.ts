import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
} from '@nestjs/common';
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
        typeof data.errorCode === 'string' &&
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
        : typeof data.message === 'string'
          ? this.messageForStatus(statusCode, data.message)
          : 'Đã xảy ra lỗi yêu cầu.';
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
      message: typeof body === 'string' ? body : 'Đã xảy ra lỗi yêu cầu.',
    };
  }

  private codeForStatus(statusCode: number): ErrorCode {
    if (statusCode === 400) return ErrorCode.VALIDATION_ERROR;
    if (statusCode === 401) return ErrorCode.UNAUTHORIZED;
    if (statusCode === 403) return ErrorCode.FORBIDDEN;
    if (statusCode === 404) return ErrorCode.NOT_FOUND;
    if (statusCode === 409) return ErrorCode.CONFLICT;
    return ErrorCode.INTERNAL_SERVER_ERROR;
  }

  private messageForStatus(statusCode: number, message: string): string {
    if (statusCode === 401 && message === 'Unauthorized') {
      return 'Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.';
    }
    if (statusCode === 403 && message === 'Forbidden') {
      return 'Bạn không có quyền thực hiện thao tác này.';
    }
    return message;
  }
}
