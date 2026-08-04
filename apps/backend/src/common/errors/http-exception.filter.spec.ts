import {
  type ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
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
});
