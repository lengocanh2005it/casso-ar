import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReceivableBalanceHistoryCharts } from './receivable-balance-history-charts';

describe('ReceivableBalanceHistoryCharts', () => {
  it('treats a zero-filled daily series as empty instead of drawing a 0–4 axis', () => {
    render(
      <ReceivableBalanceHistoryCharts
        dailySeries={[
          { date: '2026-09-01', transitions: 0 },
          { date: '2026-09-02', transitions: 0 },
        ]}
        sourceDistribution={[]}
      />,
    );

    expect(
      screen.queryByRole('img', { name: 'Biểu đồ số thay đổi theo ngày' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText('Chưa có thay đổi trong khoảng này'),
    ).toHaveLength(2);
  });

  it('titles both chart cards as headings like other section cards', () => {
    render(
      <ReceivableBalanceHistoryCharts
        dailySeries={[]}
        sourceDistribution={[]}
      />,
    );

    expect(screen.getByText('Thay đổi theo ngày')).toHaveAttribute(
      'data-slot',
      'card-title',
    );
    expect(screen.getByText('Phân bố theo nguồn thay đổi')).toHaveAttribute(
      'data-slot',
      'card-title',
    );
  });
});
