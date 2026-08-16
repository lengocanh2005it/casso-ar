import { AppError } from './app-error';
import { ErrorCode } from './error-code';

describe('AppError', () => {
  it('exposes the error code, message, and details', () => {
    const error = new AppError(
      ErrorCode.EMAIL_SEND_FAILED,
      'Gửi email thất bại.',
      {
        recipient: 'a@b.com',
      },
    );

    expect(error.errorCode).toBe(ErrorCode.EMAIL_SEND_FAILED);
    expect(error.message).toBe('Gửi email thất bại.');
    expect(error.details).toEqual({ recipient: 'a@b.com' });
    expect(error.name).toBe('AppError');
  });

  it('propagates the original error as the native cause', () => {
    const original = new Error('connection refused by SMTP server');
    const error = new AppError(
      ErrorCode.SMTP_CONNECTION_FAILED,
      'Không thể kết nối máy chủ SMTP.',
      undefined,
      { cause: original },
    );

    expect(error.cause).toBe(original);
  });

  it('withCause builds an AppError carrying the original error and details', () => {
    const original = new Error('resend API rejected the recipient');
    const error = AppError.withCause(
      original,
      ErrorCode.EMAIL_SEND_FAILED,
      'Gửi email thất bại.',
      { recipient: 'a@b.com' },
    );

    expect(error).toBeInstanceOf(AppError);
    expect(error.errorCode).toBe(ErrorCode.EMAIL_SEND_FAILED);
    expect(error.message).toBe('Gửi email thất bại.');
    expect(error.cause).toBe(original);
    expect(error.details).toEqual({ recipient: 'a@b.com' });
  });

  it('leaves cause undefined when none is provided', () => {
    const error = new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy.');

    expect(error.cause).toBeUndefined();
  });
});
