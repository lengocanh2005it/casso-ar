import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { JsonLogger } from '../observability/json-logger.service';
import { AppError } from './app-error';
import { ErrorCode } from './error-code';
import { STATUS_BY_ERROR_CODE } from './status-by-error-code';

interface ErrorEnvelope {
  statusCode: number;
  errorCode: string;
  message: string;
  details?: unknown;
}

interface RequestContext {
  method?: string;
  url?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: JsonLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    const request = host.switchToHttp().getRequest<RequestContext>();
    const envelope = this.toEnvelope(exception);
    response.status(envelope.statusCode).json(envelope);
    this.logException(exception, envelope.statusCode, request);
  }

  private logException(
    exception: unknown,
    statusCode: number,
    request: RequestContext,
  ): void {
    if (statusCode < 500) return;

    const path =
      request?.method && request?.url
        ? `${request.method} ${request.url}`
        : undefined;
    const fields = {
      path,
      ...this.causeFields(this.causeOf(exception)),
    };

    if (exception instanceof AppError) {
      this.logger.error(
        {
          message: exception.message,
          errorCode: exception.errorCode,
          ...fields,
        },
        undefined,
        HttpExceptionFilter.name,
      );
      return;
    }

    this.logger.error(
      {
        message:
          exception instanceof Error
            ? exception.message
            : 'Unhandled exception',
        errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
        ...fields,
      },
      exception instanceof Error ? exception.stack : undefined,
      HttpExceptionFilter.name,
    );
  }

  private causeOf(exception: unknown): unknown {
    return exception instanceof Error ? exception.cause : undefined;
  }

  private causeFields(cause: unknown): Record<string, unknown> {
    if (cause === undefined) return {};
    if (cause instanceof Error) {
      return {
        cause: cause.message,
        causeName: cause.name,
        ...(cause.stack === undefined ? {} : { causeStack: cause.stack }),
      };
    }
    return { cause: String(cause) };
  }

  private toEnvelope(exception: unknown): ErrorEnvelope {
    if (exception instanceof AppError) {
      return {
        statusCode: STATUS_BY_ERROR_CODE[exception.errorCode] ?? 500,
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
