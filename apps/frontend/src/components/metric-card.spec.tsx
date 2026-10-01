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

  it('keeps the warning label readable on dark cards', () => {
    render(
      <MetricCard
        label="Tỷ lệ quá hạn"
        description="Tỷ lệ công nợ quá hạn trên tổng"
        value="52%"
        icon={CircleDollarSign}
        variant="warning"
      />,
    );

    // warning-foreground is the ink for text ON a warning fill; on a dark
    // card it had near-zero contrast.
    expect(screen.getByText('Tỷ lệ quá hạn')).toHaveClass(
      'text-warning-strong',
    );
  });

  it('drops the restating description on phones to keep stacked cards short', () => {
    render(
      <MetricCard
        label="Tổng công nợ còn lại"
        description="Tất cả công nợ chưa thanh toán"
        value="616.000.000 ₫"
        icon={CircleDollarSign}
      />,
    );

    // Nine full-height cards made the reports page ~1300px of KPIs on mobile.
    expect(screen.getByText('Tất cả công nợ chưa thanh toán')).toHaveClass(
      'max-sm:hidden',
    );
  });

  it('shows a muted no-data message instead of a bare value when empty', () => {
    render(
      <MetricCard
        label="Khớp tự động"
        description="Tỷ lệ giao dịch khớp tự động"
        value="—"
        icon={CircleDollarSign}
        variant="success"
        empty
      />,
    );

    expect(screen.queryByText('—')).not.toBeInTheDocument();
    expect(screen.getByText('Chưa có dữ liệu')).toBeInTheDocument();
  });

  it('steps the amount down when its card is too narrow for 24px type', () => {
    const { container } = render(
      <MetricCard
        label="Tổng công nợ còn lại"
        description="Tất cả công nợ chưa thanh toán"
        value="616.000.000 ₫"
        icon={CircleDollarSign}
      />,
    );

    // The dashboard and reports grids put 2 cards per row from 640px and 4
    // from 1280px, which left a 219px track — 24px digits clipped mid-number.
    // The card, not the viewport, is the thing the amount has to fit inside.
    const card = container.querySelector('[data-slot="card"]');
    expect(card).toHaveClass('@container');
    expect(card?.className).not.toContain('truncate');

    const amount = screen.getByText('616.000.000 ₫');
    // 20px floor, 24px once the card itself is wide enough.
    expect(amount).toHaveClass('text-xl');
    expect(amount.className).toContain('@xs:text-2xl');
  });
});
