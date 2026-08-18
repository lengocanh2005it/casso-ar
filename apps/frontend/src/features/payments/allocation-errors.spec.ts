import { describe, expect, it } from 'vitest';
import { getAllocationErrorMessage } from './allocation-errors';

describe('getAllocationErrorMessage', () => {
  it.each([
    [
      'ALLOCATION_EXCEEDS_REMAINING',
      'Số tiền vượt quá công nợ còn lại của khoản phải thu.',
    ],
    [
      'ALLOCATION_EXCEEDS_UNALLOCATED',
      'Số tiền vượt quá số dư chưa phân bổ của khoản thanh toán.',
    ],
    [
      'CUSTOMER_MISMATCH',
      'Khoản phải thu không thuộc cùng khách hàng với khoản thanh toán.',
    ],
    [
      'PAYMENT_CUSTOMER_UNRESOLVED',
      'Không xác định được khách hàng của khoản thanh toán.',
    ],
  ])('maps %s to the expected inline Vietnamese message', (code, want) => {
    expect(
      getAllocationErrorMessage({
        response: { data: { errorCode: code } },
      }),
    ).toBe(want);
  });

  it('falls back to the default message for unknown errors', () => {
    expect(getAllocationErrorMessage(new Error('network'))).toBe(
      'Không thể phân bổ khoản thanh toán. Vui lòng thử lại.',
    );
    expect(
      getAllocationErrorMessage({
        response: { data: { errorCode: 'SOMETHING_ELSE' } },
      }),
    ).toBe('Không thể phân bổ khoản thanh toán. Vui lòng thử lại.');
  });
});
