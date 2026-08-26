import { ReceivableStatus } from '@casso-ar/shared-types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  CHANGE_SOURCE_OPTIONS,
  ReceivableBalanceHistoryFilters,
  type ReceivableBalanceHistoryFilterValues,
} from './receivable-balance-history-filters';

const values: ReceivableBalanceHistoryFilterValues = {
  from: '',
  to: '',
  receivableId: '',
  status: ReceivableStatus.OPEN,
  changeSource: '',
};

describe('ReceivableBalanceHistoryFilters', () => {
  it('labels the technical receivable filter honestly and localizes the baseline source', () => {
    render(
      <ReceivableBalanceHistoryFilters values={values} onChange={vi.fn()} />,
    );

    expect(screen.getByLabelText('Khoản phải thu')).toHaveAttribute(
      'placeholder',
      'Nhập mã kỹ thuật khoản phải thu',
    );
    expect(CHANGE_SOURCE_OPTIONS).toContainEqual({
      value: 'ROLLOUT_BASELINE',
      label: 'Dữ liệu khởi tạo',
    });
  });
});
