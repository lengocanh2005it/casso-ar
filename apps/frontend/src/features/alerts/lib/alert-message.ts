import type { AlertType } from '../types';

const MESSAGES: Record<AlertType, string> = {
  BANK_CONNECTION_NEEDS_REAUTH: 'Kết nối ngân hàng cần xác thực lại',
  BANK_CONNECTION_ERROR: 'Kết nối ngân hàng đang gặp sự cố',
  SMTP_FAILED: 'Máy chủ email của bạn gửi thất bại',
  REMINDER_SCAN_SUMMARY: 'Có email nhắc nhở đã được lên lịch gửi hôm nay',
};

export function alertMessage(type: AlertType): string {
  return MESSAGES[type];
}
