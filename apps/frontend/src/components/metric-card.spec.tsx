import { render, screen } from '@testing-library/react';
import { CircleDollarSign } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { formatVND } from '@/lib/format';
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

  it('shortens a long money amount to triệu/tỷ and keeps the full figure on hover', () => {
    const { container } = render(
      <MetricCard
        label="Tổng công nợ còn lại"
        description="Tất cả công nợ chưa thanh toán"
        value="12.450.000.000 ₫"
        amount={12_450_000_000}
        icon={CircleDollarSign}
      />,
    );

    // "12.450.000.000 ₫" needs ~230px at 24px type; a 219px card track clipped
    // the digits. Vietnamese readers scan large amounts as triệu/tỷ anyway.
    expect(screen.getByText('12,5tỷ')).toBeInTheDocument();
    expect(screen.queryByText('12.450.000.000 ₫')).not.toBeInTheDocument();

    // The exact figure stays reachable — the abbreviation is not the record.
    // formatVND() emits U+00A0 before ₫, so compare against the helper rather
    // than a hand-typed string that differs by that one invisible byte.
    expect(container.querySelector('[data-tooltip-trigger]')).toHaveAttribute(
      'title',
      formatVND(12_450_000_000),
    );
  });

  it('leaves a non-money value alone', () => {
    render(
      <MetricCard
        label="Cần đối soát"
        description="Giao dịch ngân hàng chờ đối chiếu"
        value="4"
        icon={CircleDollarSign}
      />,
    );

    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('4')).not.toHaveAttribute('title');
  });

  it('shows a value placeholder without rendering the supplied value while loading', () => {
    const { container } = render(
      <MetricCard
        label="Tổng công nợ còn lại"
        description="Tất cả công nợ chưa thanh toán"
        value="616.000.000 ₫"
        amount={616_000_000}
        icon={CircleDollarSign}
        loading
      />,
    );

    expect(
      container.querySelector('[data-slot="skeleton"]'),
    ).toBeInTheDocument();
    expect(screen.queryByText('616.000.000 ₫')).not.toBeInTheDocument();
    expect(screen.queryByText('616tr')).not.toBeInTheDocument();
  });
});
