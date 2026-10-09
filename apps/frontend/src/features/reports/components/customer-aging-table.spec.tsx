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
          { bucket: 'NOT_DUE', totalRemaining: '62000000' },
          { bucket: 'OVERDUE_1_7', totalRemaining: '0' },
          { bucket: 'OVERDUE_8_30', totalRemaining: '0' },
          { bucket: 'OVERDUE_31_60', totalRemaining: '0' },
          { bucket: 'OVERDUE_60_PLUS', totalRemaining: '44000000' },
        ],
        totalRemaining: '106000000',
      },
    ],
    total: 1,
    page: 1,
    limit: 20,
  };
}

describe('CustomerAgingTable', () => {
  it('shows exact large amounts for a customer and its buckets', () => {
    const page = buildPage();
    page.items[0].buckets[0].totalRemaining = '9007199254740993';
    page.items[0].totalRemaining = '9007199254740993';
    render(<CustomerAgingTable page={page} />);
    expect(screen.getAllByText('9.007.199.254.740.993 ₫')).toHaveLength(2);
  });
  it('mutes zero-amount bucket cells so real amounts stand out', () => {
    render(<CustomerAgingTable page={buildPage()} />);

    const zeroCell = screen.getAllByText(/^0\s*.$/)[0];
    expect(zeroCell.closest('td')?.className).toMatch(/text-muted-foreground/);
  });

  it('keeps the muted zero cell at full opacity so it stays readable', () => {
    render(<CustomerAgingTable page={buildPage()} />);

    // text-muted-foreground/50 lands at 2.64 (dark) / 2.06 (light) on a card,
    // under the 4.5 WCAG AA floor for 14px text. Alpha belongs on the surface,
    // never on the ink.
    const zeroCell = screen.getAllByText(/^0\s*.$/)[0];
    const tone = zeroCell.closest('td')?.className ?? '';
    expect(tone).toMatch(/text-muted-foreground(?!\/)/);
    expect(tone).not.toMatch(/text-muted-foreground\/\d+/);
  });

  it('colors overdue-60-plus amounts as the most severe tone', () => {
    render(<CustomerAgingTable page={buildPage()} />);

    const severeCell = screen.getByText(/44\.000\.000/);
    expect(severeCell.closest('td')?.className).toMatch(/text-destructive/);
  });

  it('does not mute or recolor a non-zero not-due amount', () => {
    render(<CustomerAgingTable page={buildPage()} />);

    const notDueCell = screen.getByText(/62\.000\.000/);
    const tone = notDueCell.closest('td')?.className ?? '';
    expect(tone).not.toMatch(/text-muted-foreground/);
    expect(tone).not.toMatch(/text-destructive/);
    expect(tone).not.toMatch(/text-warning/);
  });

  it('fits bucket headers and keeps the sticky total opaque on the card', () => {
    render(<CustomerAgingTable page={buildPage()} />);

    // Nowrap "Quá hạn trên 60 ngày" slid under the sticky total column.
    expect(
      screen.getByRole('columnheader', { name: 'Quá hạn trên 60 ngày' }),
    ).toHaveClass('whitespace-normal', 'text-right');
    // bg-background differed from the card surface in dark mode.
    expect(screen.getByText('106.000.000 ₫').closest('td')).toHaveClass(
      'bg-card',
    );
    expect(screen.getByText('62.000.000 ₫').closest('td')).toHaveClass(
      'text-right',
    );
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
    expect(screen.getByText('106.000.000 ₫').closest('td')).toHaveClass(
      STICKY_EDGE,
    );
  });

  it('stops pinning the total column on narrow screens so cells stop overlapping', () => {
    render(<CustomerAgingTable page={buildPage()} />);

    // Measured at 390px: the seven columns total 902px inside a 293px
    // scroller, and the pinned total settled at left:213 while the bucket
    // before it ran to x:822 — a 609px overlap that painted 45 text-on-text
    // collisions. `sticky right-0` only reads as "keep the total in view"
    // while the row is wider than the scroller AND the browser has room to
    // pin against. Under `max-md` the table is far wider than any phone, so
    // the pin stops helping and starts covering the bucket amounts.
    expect(
      screen.getByRole('columnheader', { name: 'Tổng còn lại' }),
    ).toHaveClass('max-md:static');
    expect(screen.getByText('106.000.000 ₫').closest('td')).toHaveClass(
      'max-md:col-start-2',
    );

    // The shadow is only meaningful while the column is actually pinned.
    expect(
      screen.getByRole('columnheader', { name: 'Tổng còn lại' }),
    ).toHaveClass('max-md:shadow-none');
  });

  it('turns each row into a card on a phone instead of a 7-column scroll', () => {
    render(<CustomerAgingTable page={buildPage()} />);

    // Seven money columns measured 902px inside a 293px scroller at 390px.
    // Below md the buckets fold into a stacked list under the customer, so
    // the row is readable without a sideways swipe.
    const row = screen.getAllByRole('row')[1];
    expect(row).toHaveClass('max-md:grid');

    // The header only makes sense while the row is a real table, so the
    // whole <thead> goes — same rule as the customers table.
    expect(screen.getAllByRole('row')[0].closest('thead')).toHaveClass(
      'max-md:hidden',
    );

    // The customer cell is the card's title row and must be allowed to wrap.
    const customerCell = screen
      .getByText('Công ty TNHH Dược phẩm ABC')
      .closest('td');
    //
    // It used to span both grid columns, which freed it from column 1's
    // width. A two-line name then grew underneath the total — measured at
    // 390px the tax code and the amount overlapped by 16px, which is the
    // "chữ bị đè" the report screenshot shows. The total sits in
    // col-start-2 / row-start-1, so the name has to stay inside col-start-1.
    expect(customerCell?.className).toContain('max-md:col-start-1');
    expect(customerCell?.className).not.toContain('max-md:col-span-2');
  });

  it('lets a long customer name wrap on the card instead of being clipped', () => {
    render(
      <CustomerAgingTable
        page={{
          items: [
            {
              ...buildPage().items[0],
              customerName: 'Công ty TNHH Dược phẩm Tâm An',
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
        }}
      />,
    );

    // Measured at 390px the name clipped to "Công ty TNHH Dược phẩm Tâ…",
    // hiding the last two words. `truncate` protects a table cell from
    // spilling into its neighbour, but the card gives the name the full
    // width, so below md it wraps instead.
    const name = screen.getByText('Công ty TNHH Dược phẩm Tâm An');
    expect(name.className).toContain('max-md:whitespace-normal');
    expect(name.className).toContain('max-md:break-words');
  });

  it('spaces the bucket rows the same way as the other mobile cards', () => {
    render(<CustomerAgingTable page={buildPage()} />);

    // Five bucket rows at 8px spacing read as one dense block next to the
    // 12px padding used by /bank-connections and /receivable-balance-history.
    const row = screen.getAllByRole('row')[1];
    expect(row.className).toContain('max-md:gap-y-3');
    expect(row.className).toContain('max-md:py-4');
  });

  it('drops the sticky-edge shadow from the total cell on a card', () => {
    render(<CustomerAgingTable page={buildPage()} />);

    // `STICKY_EDGE` is a left-edge shadow that marks a pinned column while
    // the row is scrolled sideways. Below md the column is not pinned, so
    // the shadow had nothing to describe and painted a grey smear to the
    // left of the total. The header cell already dropped it; the body cell
    // — the one the reader actually sees the amount in — had kept it.
    expect(screen.getByText('106.000.000 ₫').closest('td')).toHaveClass(
      'max-md:shadow-none',
    );
  });
});
