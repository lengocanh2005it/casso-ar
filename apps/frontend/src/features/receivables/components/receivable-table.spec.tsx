import { ReceivableStatus } from '@casso-ar/shared-types';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Receivable } from '../types';
import { ReceivableTable } from './receivable-table';

function buildReceivable(overrides: Partial<Receivable>): Receivable {
  return {
    id: 'rec-1',
    customerId: 'cust-1',
    customerName: 'Customer',
    invoiceId: null,
    invoiceNumber: 'INV-1',
    originalAmount: 100_000,
    paidAmount: 0,
    remainingAmount: 100_000,
    dueDate: '2026-09-01',
    status: ReceivableStatus.OPEN,
    salesRepresentativeId: null,
    isOverdue: false,
    isDisputed: false,
    createdAt: '2026-08-01',
    closedAt: null,
    ...overrides,
  } as Receivable;
}

describe('ReceivableTable', () => {
  it('points a brand-new organization at the create/import actions', () => {
    render(
      <MemoryRouter>
        <ReceivableTable
          receivables={[]}
          selectedIds={[]}
          onToggle={vi.fn()}
          onToggleAll={vi.fn()}
          allSelected={false}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Chưa có khoản phải thu nào')).toBeInTheDocument();
    expect(screen.getByTestId('empty-state')).toHaveTextContent(
      'Tạo khoản phải thu',
    );
    expect(screen.queryByText(/bộ lọc/)).not.toBeInTheDocument();
  });

  it('suggests changing the filters only when a filter is active', () => {
    render(
      <MemoryRouter>
        <ReceivableTable
          receivables={[]}
          selectedIds={[]}
          onToggle={vi.fn()}
          onToggleAll={vi.fn()}
          allSelected={false}
          isFiltered
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByText('Không có khoản phải thu phù hợp'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Thử đổi từ khóa tìm kiếm hoặc trạng thái lọc.'),
    ).toBeInTheDocument();
  });

  it('stacks each row into a compact card on phones instead of squeezing columns', () => {
    render(
      <MemoryRouter>
        <ReceivableTable
          receivables={[
            buildReceivable({
              customerName: 'Công ty ABC',
              remainingAmount: 40_000,
            }),
          ]}
          selectedIds={[]}
          onToggle={vi.fn()}
          onToggleAll={vi.fn()}
          allSelected={false}
        />
      </MemoryRouter>,
    );

    // CSS-only: one DOM, so text is never duplicated for screen readers.
    const [headerRow, row] = screen.getAllByRole('row');
    expect(headerRow.parentElement).toHaveClass('max-md:hidden');
    expect(row).toHaveClass('max-md:grid');
    expect(screen.getByText('100.000 ₫', { selector: 'td' })).toHaveClass(
      'max-md:hidden',
    );
    // The per-row receipt icon repeated on every line and cost ~44px width.
    expect(screen.queryByTestId('header-icon')).not.toBeInTheDocument();
  });

  it('enables the checkbox only for OPEN/PARTIALLY_PAID rows', () => {
    const onToggle = vi.fn();
    render(
      <MemoryRouter>
        <ReceivableTable
          receivables={[
            buildReceivable({ id: 'rec-open', status: ReceivableStatus.OPEN }),
            buildReceivable({ id: 'rec-paid', status: ReceivableStatus.PAID }),
          ]}
          selectedIds={[]}
          onToggle={onToggle}
          onToggleAll={vi.fn()}
          allSelected={false}
        />
      </MemoryRouter>,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[1]).not.toBeDisabled();
    expect(checkboxes[2]).toBeDisabled();
  });

  it('uses the same neutral label as detail when there is no invoice', () => {
    render(
      <MemoryRouter>
        <ReceivableTable
          receivables={[buildReceivable({ id: 'rec-1', invoiceNumber: null })]}
          selectedIds={[]}
          onToggle={vi.fn()}
          onToggleAll={vi.fn()}
          allSelected={false}
        />
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: 'Khoản phải thu' });
    expect(link).toHaveAttribute('href', '/receivables/rec-1');
    expect(link).not.toHaveClass('text-primary');
    expect(link).toHaveClass('text-muted-foreground');
    expect(screen.getByText('Không có hóa đơn')).toBeInTheDocument();
    expect(screen.queryByText('#rec-1')).not.toBeInTheDocument();
  });

  it('shows a stable customer avatar beside the customer name', () => {
    render(
      <MemoryRouter>
        <ReceivableTable
          receivables={[buildReceivable({ customerName: 'Công ty ABC' })]}
          selectedIds={[]}
          onToggle={vi.fn()}
          onToggleAll={vi.fn()}
          allSelected={false}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Công ty ABC')).toBeInTheDocument();
    expect(screen.getByText('CT')).toHaveClass('shrink-0');
  });

  it('uses a Vietnamese fallback instead of a missing customer id', () => {
    render(
      <MemoryRouter>
        <ReceivableTable
          receivables={[
            buildReceivable({
              customerId: 'a1b2c3d4-e5f6-47a8-9abc-1234567890ab',
              customerName: null,
            }),
          ]}
          selectedIds={[]}
          onToggle={vi.fn()}
          onToggleAll={vi.fn()}
          allSelected={false}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Chưa có tên khách hàng')).toBeInTheDocument();
    expect(
      screen.queryByText('a1b2c3d4-e5f6-47a8-9abc-1234567890ab'),
    ).not.toBeInTheDocument();
  });
});
