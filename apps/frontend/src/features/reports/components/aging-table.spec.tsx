import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AgingReport } from '../types';
import { AgingTable } from './aging-table';

const report: AgingReport = {
  buckets: [
    { bucket: 'NOT_DUE', count: 10, totalRemaining: 295_200_000 },
    { bucket: 'OVERDUE_1_7', count: 4, totalRemaining: 25_000_000 },
    { bucket: 'OVERDUE_8_30', count: 0, totalRemaining: 0 },
    { bucket: 'OVERDUE_31_60', count: 1, totalRemaining: 45_800_000 },
    { bucket: 'OVERDUE_60_PLUS', count: 3, totalRemaining: 50_000_000 },
  ],
};

describe('AgingTable', () => {
  it('stacks the bucket summary into a card on a phone', () => {
    render(<AgingTable report={report} totalOutstanding={616_000_000} />);

    // Measured at 390px this four-column summary ran 89px past its 293px
    // scroller, so the last column ("Tỷ trọng") had to be swiped into view.
    // Below md the bucket name becomes the card title and the three numbers
    // fold under it.
    const header = screen.getAllByRole('row')[0].closest('thead');
    expect(header).toHaveClass('max-md:hidden');

    const row = screen.getAllByRole('row')[1];
    expect(row).toHaveClass('max-md:grid');

    const bucketCell = screen.getByText('Chưa đến hạn').closest('td');
    expect(bucketCell?.className).toContain('max-md:col-span-2');
  });

  it('keeps the footer total readable on a phone', () => {
    render(<AgingTable report={report} totalOutstanding={616_000_000} />);

    // The footer carries the same three numbers, so it folds the same way
    // instead of staying a single cramped 4-cell row.
    const totalRow = screen.getByText('Tổng').closest('tr');
    expect(totalRow).toHaveClass('max-md:grid');
  });

  it('spaces each bucket card like the other mobile cards', () => {
    render(<AgingTable report={report} totalOutstanding={616_000_000} />);

    // Matches the 12px row gap / 16px padding used by /bank-connections and
    // /receivable-balance-history so the three summary tables read as one set.
    const row = screen.getAllByRole('row')[1];
    expect(row.className).toContain('max-md:gap-y-3');
    expect(row.className).toContain('max-md:py-4');
  });
});
