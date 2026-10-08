const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  INVOICE_CREATED: 'Tạo hóa đơn',
  EMAIL_SENT: 'Đã gửi email nhắc nợ',
  EMAIL_FAILED: 'Gửi email thất bại',
  PAYMENT_RECEIVED: 'Nhận thanh toán',
  ALLOCATION_UNDONE: 'Hoàn tác phân bổ',
  RECEIVABLE_CLOSED: 'Đã đóng công nợ',
  DISPUTE_OPENED: 'Mở tranh chấp',
  DISPUTE_RESOLVED: 'Đã giải quyết tranh chấp',
  MANUAL_CALL: 'Gọi điện thủ công',
  MANUAL_NOTE: 'Ghi chú thủ công',
  PAYMENT_COMMITMENT: 'Cam kết thanh toán',
};

export function formatActivityType(activityType: string): string {
  return ACTIVITY_TYPE_LABELS[activityType] ?? 'Hoạt động khác';
}
