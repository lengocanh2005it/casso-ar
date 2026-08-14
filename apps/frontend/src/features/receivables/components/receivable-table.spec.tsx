import { ReceivableStatus } from '@casso-ledger/shared-types';
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
});
