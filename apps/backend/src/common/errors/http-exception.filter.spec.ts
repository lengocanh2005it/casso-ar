import {
  type ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JsonLogger } from '../observability/json-logger.service';
import { AppError } from './app-error';
import { ErrorCode } from './error-code';
import { HttpExceptionFilter } from './http-exception.filter';

interface ErrorResponse {
  statusCode: number;
  errorCode: string;
  message: string;
  details?: unknown;
}

function createFilter(): {
  filter: HttpExceptionFilter;
  logger: { error: jest.Mock; warn: jest.Mock };
} {
  const logger = { error: jest.fn(), warn: jest.fn() };
  const filter = new HttpExceptionFilter(logger as unknown as JsonLogger);
  return { filter, logger };
}

function captureResponse(exception: unknown): {
  response: ErrorResponse;
  logger: { error: jest.Mock; warn: jest.Mock };
} {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'GET', url: '/api/v1/receivables' }),
    }),
  } as unknown as ArgumentsHost;

  const { filter, logger } = createFilter();
  filter.catch(exception, host);

  return { response: response.json.mock.calls[0][0] as ErrorResponse, logger };
}

describe('HttpExceptionFilter', () => {
  it('maps unauthorized exceptions to the standard envelope', () => {
    expect(captureResponse(new UnauthorizedException()).response).toEqual({
      statusCode: 401,
      errorCode: ErrorCode.UNAUTHORIZED,
      message: 'Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.',
    });
  });

  it('maps forbidden exceptions to the standard envelope', () => {
    expect(captureResponse(new ForbiddenException()).response).toEqual({
      statusCode: 403,
      errorCode: ErrorCode.FORBIDDEN,
      message: 'Bạn không có quyền thực hiện thao tác này.',
    });
  });

  it('preserves validation field errors in details', () => {
    const details = {
      originalAmount: ['originalAmount must be a positive number'],
    };

    expect(
      captureResponse(
        new BadRequestException({
          statusCode: 400,
          errorCode: ErrorCode.VALIDATION_ERROR,
          message: 'Dữ liệu đầu vào không hợp lệ.',
          details,
        }),
      ).response,
    ).toEqual({
      statusCode: 400,
      errorCode: ErrorCode.VALIDATION_ERROR,
      message: 'Dữ liệu đầu vào không hợp lệ.',
      details,
    });
  });

  it('hides unknown error details behind a generic internal response', () => {
    expect(
      captureResponse(new Error('database password is invalid')).response,
    ).toEqual({
      statusCode: 500,
      errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
      message: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.',
    });
  });

  it('maps AppError to the standard envelope using the error code', () => {
    expect(
      captureResponse(new AppError(ErrorCode.UNAUTHORIZED, 'Sai mật khẩu.'))
        .response,
    ).toEqual({
      statusCode: 401,
      errorCode: ErrorCode.UNAUTHORIZED,
      message: 'Sai mật khẩu.',
    });
  });

  it('maps AppError with details to the standard envelope', () => {
    expect(
      captureResponse(
        new AppError(ErrorCode.PLAN_LIMIT_EXCEEDED, 'Đã đạt giới hạn gói.', {
          planId: 'FREE',
        }),
      ).response,
    ).toEqual({
      statusCode: 402,
      errorCode: ErrorCode.PLAN_LIMIT_EXCEEDED,
      message: 'Đã đạt giới hạn gói.',
      details: { planId: 'FREE' },
    });
  });

  it('maps AppError with an unmapped error code to 500', () => {
    expect(
      captureResponse(
        new AppError(ErrorCode.EMAIL_SEND_FAILED, 'Gửi email thất bại.'),
      ).response,
    ).toEqual({
      statusCode: 500,
      errorCode: ErrorCode.EMAIL_SEND_FAILED,
      message: 'Gửi email thất bại.',
    });
  });

  // Regression guard for the AGENTS.md "API Error Codes" table drifting out
  // of sync with http-exception.filter.ts's statusForErrorCode map. Every
  // ErrorCode must resolve to a real (non-500) status unless it's one of the
  // codes that is legitimately documented/expected to be 500.
  it('never silently falls back to 500 for an ErrorCode with a documented non-500 status', () => {
    const expectedFiveHundredCodes = new Set<ErrorCode>([
      ErrorCode.INTERNAL_SERVER_ERROR,
      ErrorCode.EMAIL_SEND_FAILED,
      ErrorCode.TOKEN_ENCRYPTION_FAILED,
    ]);

    for (const code of Object.values(ErrorCode)) {
      const { response } = captureResponse(new AppError(code, 'x'));
      if (expectedFiveHundredCodes.has(code)) {
        expect(response.statusCode).toBe(500);
      } else {
        expect(response.statusCode).toBeLessThan(500);
      }
    }
  });

  it('logs unexpected exceptions at error level with request path and stack', () => {
    const unexpected = new Error('database connection refused');
    const { logger } = captureResponse(unexpected);

    expect(logger.error).toHaveBeenCalledTimes(1);
    const [message, trace, context] = logger.error.mock.calls[0];
    expect(message).toMatchObject({
      message: 'Unhandled exception',
      errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
      path: 'GET /api/v1/receivables',
    });
    expect(trace).toBe(unexpected.stack);
    expect(context).toBe(HttpExceptionFilter.name);
  });

  it('logs AppError mapped to a 5xx status at warn level with error code', () => {
    const { logger } = captureResponse(
      new AppError(ErrorCode.EMAIL_SEND_FAILED, 'Gửi email thất bại.'),
    );

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toMatchObject({
      message: 'Gửi email thất bại.',
      errorCode: ErrorCode.EMAIL_SEND_FAILED,
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('does not log AppError mapped to a non-5xx status', () => {
    const { logger } = captureResponse(
      new AppError(ErrorCode.UNAUTHORIZED, 'Sai mật khẩu.'),
    );

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('does not log expected HttpExceptions', () => {
    const { logger } = captureResponse(new UnauthorizedException());

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});
