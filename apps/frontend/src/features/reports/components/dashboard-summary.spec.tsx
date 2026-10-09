import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardSummary } from './dashboard-summary';

describe('DashboardSummary', () => {
  it('shows full exact monetary totals and forecasts', () => {
    render(
      <DashboardSummary
        summary={{
          totalOutstanding: '9007199254740993',
          totalOverdue: '12345678901234567890',
          overdueRate: 0.5,
          cashForecast: {
            forecast7d: '9007199254740993',
            forecast14d: '0',
            forecast30d: '12345678901234567890',
          },
          topOverdueCustomers: [],
          autoMatchRate: null,
          manualHandlingRate: null,
          reminderEffectiveness: null,
        }}
      />,
    );
    expect(screen.getAllByText('9.007.199.254.740.993 ₫')).toHaveLength(2);
    expect(screen.getAllByText('12.345.678.901.234.567.890 ₫')).toHaveLength(2);
  });
});
