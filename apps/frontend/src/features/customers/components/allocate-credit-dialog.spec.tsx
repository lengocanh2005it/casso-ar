import { ReceivableStatus } from '@casso-ar/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Receivable } from '@/features/receivables/types';
import { AllocateCreditDialog } from './allocate-credit-dialog';

const postWithIdempotency = vi.fn();

vi.mock('@/lib/api-client', () => ({
  getApiErrorCode: (error: unknown) => {
    if (typeof error !== 'object' || error === null || !('response' in error)) {
      return undefined;
    }
    const response = error.response;
    if (
      typeof response !== 'object' ||
      response === null ||
      !('data' in response)
    ) {
      return undefined;
    }
    const data = response.data;
    return typeof data === 'object' && data !== null && 'errorCode' in data
      ? String(data.errorCode)
      : undefined;
  },
  postWithIdempotency: (...args: unknown[]) => postWithIdempotency(...args),
}));

const payment = {
  paymentId: 'payment-1',
  totalAmount: 1_500_000,
  allocatedAmount: 0,
  unallocatedAmount: 1_500_000,
  payerName: 'Công ty B',
  receivedAt: '2026-08-01T00:00:00.000Z',
};

const receivables: Receivable[] = [
  {
    id: 'receivable-1',
    customerId: 'customer-1',
    invoiceId: 'INV-1',
    invoiceNumber: 'INV-1',
    originalAmount: 1_000_000,
    paidAmount: 0,
    remainingAmount: 1_000_000,
    dueDate: '2026-08-10',
    status: ReceivableStatus.OPEN,
    isDisputed: false,
    disputeId: null,
    isOverdue: false,
    salesRepresentativeId: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    closedAt: null,
  },
];

function renderDialog(receivableOptions = receivables) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AllocateCreditDialog
        payment={payment}
        receivables={receivableOptions}
        open
        onOpenChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe('AllocateCreditDialog', () => {
  beforeEach(() => {
    postWithIdempotency.mockReset();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('blocks an amount above the smaller payment or receivable balance', async () => {
    renderDialog();

    fireEvent.click(screen.getByRole('combobox', { name: /khoản phải thu/i }));
    fireEvent.click(screen.getByRole('option', { name: /INV-1/i }));
    fireEvent.change(screen.getByLabelText(/số tiền phân bổ/i), {
      target: { value: '1000001' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Phân bổ' }));

    expect(screen.getByRole('alert')).toHaveTextContent('không được vượt quá');
    expect(postWithIdempotency).not.toHaveBeenCalled();
  });

  it('does not expose a technical id when a receivable has no invoice', async () => {
    renderDialog([
      {
        ...receivables[0],
        id: 'receivable-no-invoice',
        invoiceId: null,
        invoiceNumber: null,
      },
    ]);

    fireEvent.click(screen.getByRole('combobox', { name: /khoản phải thu/i }));

    expect(
      screen.getByRole('option', { name: /Khoản phải thu/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: /receivable-no-invoice/ }),
    ).not.toBeInTheDocument();
  });

  it('rejects an over-ceiling amount while typing, before the user submits', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('combobox', { name: /khoản phải thu/i }));
    fireEvent.click(screen.getByRole('option', { name: /INV-1/i }));
    fireEvent.change(screen.getByLabelText(/số tiền phân bổ/i), {
      target: { value: '1000001' },
    });

    // The ceiling is 1.000.000 (min of the 1.500.000 unallocated payment and
    // the 1.000.000 remaining balance). Silent rejection on submit alone
    // leaves the field looking valid while holding an impossible value.
    expect(screen.getByRole('alert')).toHaveTextContent('không được vượt quá');
    expect(screen.getByLabelText(/số tiền phân bổ/i)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('clears the ceiling error once the amount is corrected', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('combobox', { name: /khoản phải thu/i }));
    fireEvent.click(screen.getByRole('option', { name: /INV-1/i }));
    const input = screen.getByLabelText(/số tiền phân bổ/i);

    fireEvent.change(input, { target: { value: '1000001' } });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '1000000' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });

  it('posts a valid allocation and shows backend allocation errors inline', async () => {
    postWithIdempotency.mockRejectedValueOnce({
      response: { data: { errorCode: 'CUSTOMER_MISMATCH' } },
    });
    renderDialog();

    fireEvent.click(screen.getByRole('combobox', { name: /khoản phải thu/i }));
    fireEvent.click(screen.getByRole('option', { name: /INV-1/i }));
    fireEvent.change(screen.getByLabelText(/số tiền phân bổ/i), {
      target: { value: '500000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Phân bổ' }));

    await waitFor(() =>
      expect(postWithIdempotency).toHaveBeenCalledWith(
        '/api/v1/payments/payment-1/allocate',
        { receivableId: 'receivable-1', amount: 500_000 },
      ),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Khoản phải thu không thuộc cùng khách hàng với khoản thanh toán.',
    );
  });

  it('emphasises only the actionable allocation ceiling', async () => {
    renderDialog();

    // Per the #346 money-hierarchy rule the dialog's one actionable number is
    // the max allocatable amount. The editable input and the unallocated
    // balance are context — bolding them would put several bold money values
    // in one small dialog, which is the mistake #346 fixed.
    fireEvent.click(screen.getByRole('combobox', { name: /khoản phải thu/i }));
    fireEvent.click(screen.getByRole('option', { name: /INV-1/i }));

    const ceiling = screen.getByText(/Tối đa:/);
    expect(ceiling.querySelector('span')).toHaveClass(
      'font-semibold',
      'tabular-nums',
    );
    expect(screen.getByLabelText(/số tiền phân bổ/i)).not.toHaveClass(
      'font-semibold',
    );
  });
});
