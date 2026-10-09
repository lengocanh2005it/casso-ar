import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReceivableBalanceHistoryKpis } from './receivable-balance-history-kpis';

describe('ReceivableBalanceHistoryKpis', () => {
  it('shows the full exact latest balance', () => {
    render(
      <ReceivableBalanceHistoryKpis
        isLoading={false}
        summary={{
          totalTransitions: 1,
          affectedReceivables: 1,
          latestRemainingAmount: '9007199254740993',
          dailySeries: [],
          sourceDistribution: [],
        }}
      />,
    );
    expect(screen.getByText('9.007.199.254.740.993 ₫')).toBeInTheDocument();
  });
  it('uses the same metric card as the dashboard and reports', async () => {
    render(
      <ReceivableBalanceHistoryKpis
        isLoading={false}
        summary={{
          totalTransitions: 112,
          affectedReceivables: 67,
          latestRemainingAmount: '616000000',
          dailySeries: [],
          sourceDistribution: [],
        }}
      />,
    );

    // A third KPI style (icon tile + tinted border) existed only here.
    for (const label of [
      'Tổng số thay đổi',
      'Khoản phải thu bị ảnh hưởng',
      'Số dư còn lại mới nhất',
    ]) {
      expect(screen.getByText(label).closest('[data-slot="card"]')).toHaveClass(
        'border-l-4',
      );
    }
    expect(screen.getByText('616.000.000 ₫')).toBeInTheDocument();
  });
});
