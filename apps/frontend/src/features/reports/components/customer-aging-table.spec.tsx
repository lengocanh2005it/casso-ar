import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { STICKY_EDGE } from '@/lib/chart';
import type { CustomerAgingPage } from '../types';
import { CustomerAgingTable } from './customer-aging-table';

function buildPage(): CustomerAgingPage {
  return {
    items: [
      {
        customerId: 'c1',
        customerName: 'Công ty TNHH Dược phẩm ABC',
        taxCode: '0309999005',
        buckets: [
          { bucket: 'NOT_DUE', totalRemaining: 62_000_000 },
          { bucket: 'OVERDUE_1_7', totalRemaining: 0 },
          { bucket: 'OVERDUE_8_30', totalRemaining: 0 },
          { bucket: 'OVERDUE_31_60', totalRemaining: 0 },
          { bucket: 'OVERDUE_60_PLUS', totalRemaining: 44_000_000 },
        ],
        totalRemaining: 106_000_000,
      },
    ],
    total: 1,
    page: 1,
    limit: 20,
  };
}

describe('CustomerAgingTable', () => {
  it('mutes zero-amount bucket cells so real amounts stand out', () => {
    render(<CustomerAgingTable page={buildPage()} />);

    const zeroCell = screen.getAllByText(/^0\s*.$/)[0];
    expect(zeroCell.className).toMatch(/text-muted-foreground/);
  });

  it('keeps the muted zero cell at full opacity so it stays readable', () => {
    render(<CustomerAgingTable page={buildPage()} />);

    // text-muted-foreground/50 lands at 2.64 (dark) / 2.06 (light) on a card,
    // under the 4.5 WCAG AA floor for 14px text. Alpha belongs on the surface,
    // never on the ink.
    const zeroCell = screen.getAllByText(/^0\s*.$/)[0];
    expect(zeroCell.className).toMatch(/text-muted-foreground(?!\/)/);
    expect(zeroCell.className).not.toMatch(/text-muted-foreground\/\d+/);
  });

  it('colors overdue-60-plus amounts as the most severe tone', () => {
    render(<CustomerAgingTable page={buildPage()} />);

    const severeCell = screen.getByText(/44\.000\.000/);
    expect(severeCell.className).toMatch(/text-destructive/);
  });

  it('does not mute or recolor a non-zero not-due amount', () => {
    render(<CustomerAgingTable page={buildPage()} />);

    const notDueCell = screen.getByText(/62\.000\.000/);
    expect(notDueCell.className).not.toMatch(/text-muted-foreground/);
    expect(notDueCell.className).not.toMatch(/text-destructive/);
    expect(notDueCell.className).not.toMatch(/text-warning/);
  });

  it('fits bucket headers and keeps the sticky total opaque on the card', () => {
    render(<CustomerAgingTable page={buildPage()} />);

    // Nowrap "Quá hạn trên 60 ngày" slid under the sticky total column.
    expect(
      screen.getByRole('columnheader', { name: 'Quá hạn trên 60 ngày' }),
    ).toHaveClass('whitespace-normal', 'text-right');
    // bg-background differed from the card surface in dark mode.
    expect(screen.getByText('106.000.000 ₫')).toHaveClass('bg-card');
    expect(screen.getByText('62.000.000 ₫')).toHaveClass('text-right');
  });

  it('shows the tax code under the customer name so every bucket column fits', () => {
    render(<CustomerAgingTable page={buildPage()} />);

    // A separate tax-code column pushed "Quá hạn trên 60 ngày" under the
    // sticky total at 1440px with real (multi-billion) amounts.
    expect(
      screen.queryByRole('columnheader', { name: 'Mã số thuế' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('0309999005').closest('td')).toBe(
      screen.getByText('Công ty TNHH Dược phẩm ABC').closest('td'),
    );
  });

  it('shades the sticky total edge so a clipped table reads as scrollable', () => {
    render(<CustomerAgingTable page={buildPage()} />);

    expect(
      screen.getByRole('columnheader', { name: 'Tổng còn lại' }),
    ).toHaveClass(STICKY_EDGE);
    expect(screen.getByText('106.000.000 ₫')).toHaveClass(STICKY_EDGE);
  });
});
