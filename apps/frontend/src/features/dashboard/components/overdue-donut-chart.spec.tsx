import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OverdueDonutChart } from './overdue-donut-chart';

describe('OverdueDonutChart', () => {
  it('keeps the on-time remainder exact past Number precision', () => {
    render(
      <OverdueDonutChart
        totalOutstanding="9007199254740993"
        totalOverdue="1"
      />,
    );
    expect(screen.getByText('9.007.199.254.740.992 ₫')).toBeInTheDocument();
  });
  it('renders an accessible ring with the overdue split and amounts', () => {
    render(
      <OverdueDonutChart
        totalOutstanding="100000000"
        totalOverdue="30000000"
      />,
    );

    expect(
      screen.getByRole('img', {
        name: 'Tỷ lệ công nợ: 30% quá hạn, 70% còn hạn',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('30%')).toHaveLength(2);
    expect(screen.getByText('70%')).toBeInTheDocument();
    expect(screen.getByText('30.000.000 ₫')).toBeInTheDocument();
    expect(screen.getByText('70.000.000 ₫')).toBeInTheDocument();
  });

  it('stacks the donut above the allocation details', () => {
    render(
      <OverdueDonutChart
        totalOutstanding="100000000"
        totalOverdue="30000000"
      />,
    );

    const layout = screen.getByRole('img').parentElement?.parentElement;
    expect(layout).toHaveClass('flex', 'flex-col', 'items-center');
  });

  it('shows a useful empty state when there is no outstanding debt', () => {
    render(<OverdueDonutChart totalOutstanding="0" totalOverdue="0" />);

    expect(screen.getByTestId('empty-state')).toHaveTextContent(
      'Chưa có công nợ',
    );
  });
});
