import { describe, expect, it } from 'vitest';
import { alertMessage } from './alert-message';

describe('alertMessage', () => {
  it('maps BANK_CONNECTION_NEEDS_REAUTH', () => {
    expect(alertMessage('BANK_CONNECTION_NEEDS_REAUTH')).toBe(
      'Kết nối ngân hàng cần xác thực lại',
    );
  });

  it('maps BANK_CONNECTION_ERROR', () => {
    expect(alertMessage('BANK_CONNECTION_ERROR')).toBe(
      'Kết nối ngân hàng đang gặp sự cố',
    );
  });

  it('maps SMTP_FAILED', () => {
    expect(alertMessage('SMTP_FAILED')).toBe(
      'Máy chủ email của bạn gửi thất bại',
    );
  });

  it('maps REMINDER_SCAN_SUMMARY', () => {
    expect(alertMessage('REMINDER_SCAN_SUMMARY')).toBe(
      'Có email nhắc nhở đã được lên lịch gửi hôm nay',
    );
  });
});
