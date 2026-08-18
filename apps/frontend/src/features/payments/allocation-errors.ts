import { getApiErrorCode } from '@/lib/api-client';

const ALLOCATION_ERROR_MESSAGES: Record<string, string> = {
  ALLOCATION_EXCEEDS_REMAINING:
    'Số tiền vượt quá công nợ còn lại của khoản phải thu.',
  ALLOCATION_EXCEEDS_UNALLOCATED:
    'Số tiền vượt quá số dư chưa phân bổ của khoản thanh toán.',
  CUSTOMER_MISMATCH:
    'Khoản phải thu không thuộc cùng khách hàng với khoản thanh toán.',
  PAYMENT_CUSTOMER_UNRESOLVED:
    'Không xác định được khách hàng của khoản thanh toán.',
};

export function getAllocationErrorMessage(error: unknown): string {
  const errorCode = getApiErrorCode(error);

  return errorCode
    ? (ALLOCATION_ERROR_MESSAGES[errorCode] ??
        'Không thể phân bổ khoản thanh toán. Vui lòng thử lại.')
    : 'Không thể phân bổ khoản thanh toán. Vui lòng thử lại.';
}
