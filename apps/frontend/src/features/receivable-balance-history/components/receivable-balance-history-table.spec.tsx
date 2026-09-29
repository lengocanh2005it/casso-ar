import { ReceivableStatus } from '@casso-ar/shared-types';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ReceivableBalanceHistoryTable } from './receivable-balance-history-table';

describe('ReceivableBalanceHistoryTable', () => {
  it('uses Vietnamese fallbacks instead of raw internal codes or IDs', () => {
    render(
      <MemoryRouter>
        <ReceivableBalanceHistoryTable
          items={[
            {
              id: 'history-1',
              sequence: 1,
              receivableId: '77b1de38-2ace-4b6d-b6b3-cf81d70b1024',
              invoiceNumber: null,
              customerId: 'customer-1',
              customerName: null,
              status: ReceivableStatus.OPEN,
              remainingAmount: 1_000_000,
              effectiveAt: '2026-08-26T01:00:00.000Z',
              changeSource: 'ROLLOUT_BASELINE',
              reasonCode: 'ROLLOUT_BASELINE',
              actorType: null,
              actorUserId: null,
              actorDisplayName: null,
              transitionReferenceId: null,
              note: null,
            },
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Khoản phải thu')).toBeInTheDocument();
    expect(screen.getByText('Chưa có tên khách hàng')).toBeInTheDocument();
    expect(screen.getByText('Dữ liệu khởi tạo')).toBeInTheDocument();
    // Same wording and colour as the receivables list (was "Mở").
    expect(screen.getByText('Đang thu')).toHaveClass('text-info');
  });
});
