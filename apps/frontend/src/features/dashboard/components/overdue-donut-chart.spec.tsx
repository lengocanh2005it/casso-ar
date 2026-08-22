import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OverdueDonutChart } from './overdue-donut-chart';

describe('OverdueDonutChart', () => {
  it('renders an accessible ring with the overdue split and amounts', () => {
    render(
      <OverdueDonutChart
        totalOutstanding={100_000_000}
        totalOverdue={30_000_000}
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
        totalOutstanding={100_000_000}
        totalOverdue={30_000_000}
      />,
    );

    const layout = screen.getByRole('img').parentElement?.parentElement;
    expect(layout).toHaveClass('flex', 'flex-col', 'items-center');
  });

  it('shows a useful empty state when there is no outstanding debt', () => {
    render(<OverdueDonutChart totalOutstanding={0} totalOverdue={0} />);

    expect(screen.getByText('Chưa có dữ liệu công nợ.')).toBeInTheDocument();
  });
});
