import { render, screen } from '@testing-library/react';
import { CircleDollarSign } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { MetricCard } from './metric-card';

describe('MetricCard', () => {
  it('uses a semantic label tone for the success variant', () => {
    render(
      <MetricCard
        label="Đã thu"
        description="Tổng tiền đã thu"
        value="30.000.000 ₫"
        icon={CircleDollarSign}
        variant="success"
      />,
    );

    expect(screen.getByText('Đã thu')).toHaveClass('text-success');
    expect(screen.getByText('30.000.000 ₫')).toBeInTheDocument();
  });
});
