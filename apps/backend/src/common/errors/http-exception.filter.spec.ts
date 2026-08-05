import {
  type ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AppError } from './app-error';
import { ErrorCode } from './error-code';
import { HttpExceptionFilter } from './http-exception.filter';

interface ErrorResponse {
  statusCode: number;
  errorCode: string;
  message: string;
  details?: unknown;
}

function captureResponse(exception: unknown): ErrorResponse {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  new HttpExceptionFilter().catch(exception, host);

  return response.json.mock.calls[0][0] as ErrorResponse;
}

describe('HttpExceptionFilter', () => {
  it('maps unauthorized exceptions to the standard envelope', () => {
    expect(captureResponse(new UnauthorizedException())).toEqual({
      statusCode: 401,
      errorCode: ErrorCode.UNAUTHORIZED,
      message: 'Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.',
    });
  });

  it('maps forbidden exceptions to the standard envelope', () => {
    expect(captureResponse(new ForbiddenException())).toEqual({
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
      ),
    ).toEqual({
      statusCode: 400,
      errorCode: ErrorCode.VALIDATION_ERROR,
      message: 'Dữ liệu đầu vào không hợp lệ.',
      details,
    });
  });

  it('hides unknown error details behind a generic internal response', () => {
    expect(captureResponse(new Error('database password is invalid'))).toEqual({
      statusCode: 500,
      errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
      message: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.',
    });
  });

  it('maps AppError to the standard envelope using the error code', () => {
    expect(
      captureResponse(new AppError(ErrorCode.UNAUTHORIZED, 'Sai mật khẩu.')),
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
      ),
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
      ),
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
    ]);

    for (const code of Object.values(ErrorCode)) {
      const { statusCode } = captureResponse(new AppError(code, 'x'));
      if (expectedFiveHundredCodes.has(code)) {
        expect(statusCode).toBe(500);
      } else {
        expect(statusCode).toBeLessThan(500);
      }
    }
  });
});
