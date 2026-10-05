import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BankTransaction } from '../types';
import { SplitMatchDialog } from './split-match-dialog';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
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
  getApiErrorDetails: (error: unknown) => {
    if (typeof error !== 'object' || error === null || !('response' in error)) {
      return undefined;
    }
    const response = (error as { response?: unknown }).response;
    if (
      typeof response !== 'object' ||
      response === null ||
      !('data' in response)
    ) {
      return undefined;
    }
    const data = (response as { data?: unknown }).data;
    if (typeof data !== 'object' || data === null || !('details' in data)) {
      return undefined;
    }
    const details = (data as { details?: unknown }).details;
    return typeof details === 'object' && details !== null
      ? (details as Record<string, unknown>)
      : undefined;
  },
  postWithIdempotency: (url: string, data?: unknown, headers?: unknown) =>
    apiRequest({
      url,
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': 'test-key', ...(headers as object) },
    }),
}));

const { toastSuccess, toastWarning, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    warning: (...a: unknown[]) => toastWarning(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { role: 'ACCOUNTANT' } }),
}));

const tx: BankTransaction = {
  id: 'bt9',
  bankConnectionId: 'bc1',
  providerTransactionId: 'p9',
  amount: 50_000_000,
  transactionDateTime: '2026-08-02T10:00:00Z',
  counterpartyAccountNumber: '999',
  counterpartyName: 'Company C',
  transferContent: 'Payment for INV-001',
  status: 'PENDING_REVIEW',
  version: 1,
};

const candidates = [
  {
    id: 'mc1',
    bankTransactionId: 'bt9',
    receivableId: 'r1',
    customerId: 'c1',
    referenceCodeScore: 60,
    amountScore: 10,
    customerBankAccountScore: 10,
    payerNameScore: 0,
    timingScore: 0,
    totalScore: 80,
    invoiceNumber: 'INV-2026-001',
    customerName: 'Công ty An Phát',
    remainingAmount: 50_000_000,
    dueDate: '2026-08-31T00:00:00Z',
  },
  {
    id: 'mc2',
    bankTransactionId: 'bt9',
    receivableId: 'r2',
    customerId: 'c1',
    referenceCodeScore: 30,
    amountScore: 10,
    customerBankAccountScore: 10,
    payerNameScore: 0,
    timingScore: 0,
    totalScore: 50,
    invoiceNumber: 'INV-2026-002',
    customerName: 'Công ty An Phát',
    remainingAmount: 30_000_000,
    dueDate: '2026-08-31T00:00:00Z',
  },
];

function renderDialog(aiRecommendation?: {
  status: 'SUCCEEDED' | 'ABSTAINED' | 'FAILED';
  recommendedReceivableId: string | null;
  confidence: number | null;
  reason: string | null;
  isCurrent: boolean;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SplitMatchDialog
        tx={tx}
        aiRecommendation={aiRecommendation}
        open
        onOpenChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe('SplitMatchDialog', () => {
  beforeEach(() => {
    apiRequest.mockClear();
    toastSuccess.mockClear();
    toastWarning.mockClear();
    toastError.mockClear();
  });

  it('shows a labeled transfer content field', async () => {
    apiRequest.mockResolvedValue(candidates);
    renderDialog();

    expect(screen.getByText('Nội dung chuyển khoản')).toBeInTheDocument();
    expect(screen.getByText('Payment for INV-001')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Tìm khách hàng để ghi nhận công nợ').parentElement,
    ).toHaveClass('grid', 'gap-2');
    expect(
      screen.getByRole('button', { name: 'Khớp giao dịch' }).parentElement,
    ).toHaveClass('gap-3');
  });

  it('titles the dialog with the counterparty name instead of the raw provider id', async () => {
    apiRequest.mockResolvedValue(candidates);
    renderDialog();

    expect(
      screen.getByRole('heading', { name: /xử lý giao dịch company c/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('p9')).not.toBeInTheDocument();
  });

  it('falls back to the transfer content, then the raw provider id, when there is no counterparty name', async () => {
    apiRequest.mockResolvedValue(candidates);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <SplitMatchDialog
          tx={{ ...tx, counterpartyName: null }}
          open
          onOpenChange={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole('heading', {
        name: /xử lý giao dịch payment for inv-001/i,
      }),
    ).toBeInTheDocument();
  });

  it('shows a fallback when the transfer content is blank', async () => {
    apiRequest.mockResolvedValue(candidates);
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <SplitMatchDialog
          tx={{ ...tx, transferContent: null }}
          open
          onOpenChange={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Không có nội dung')).toBeInTheDocument();
  });

  it('shows an AI reason without pre-filling manual allocation amounts', async () => {
    apiRequest.mockResolvedValue(candidates);
    renderDialog({
      status: 'SUCCEEDED',
      recommendedReceivableId: 'r1',
      confidence: 75,
      reason: 'Tên và số tiền phù hợp.',
      isCurrent: true,
    });

    expect(await screen.findByText('Gợi ý AI · Vừa')).toBeInTheDocument();
    expect(screen.getByText('Tên và số tiền phù hợp.')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/số tiền phân bổ/i)[0]).toHaveValue(null);
  });

  it.each([
    {
      status: 'SUCCEEDED' as const,
      recommendedReceivableId: 'r1',
      confidence: 90,
      reason: 'Cũ.',
      isCurrent: false,
    },
    {
      status: 'ABSTAINED' as const,
      recommendedReceivableId: null,
      confidence: 40,
      reason: 'Không đủ dữ kiện.',
      isCurrent: false,
    },
    {
      status: 'FAILED' as const,
      recommendedReceivableId: null,
      confidence: null,
      reason: null,
      isCurrent: false,
    },
  ])(
    'does not present a stale or unavailable AI recommendation as actionable',
    async (recommendation) => {
      apiRequest.mockResolvedValue(candidates);
      renderDialog(recommendation);

      expect(await screen.findByText('AI không có gợi ý')).toBeInTheDocument();
      expect(screen.queryByText(/Gợi ý AI ·/)).not.toBeInTheDocument();
    },
  );
  it('shows the candidate invoice and customer before its technical id', async () => {
    apiRequest.mockResolvedValue(candidates);
    renderDialog();

    expect(
      await screen.findByText('INV-2026-001 — Công ty An Phát'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Còn lại: 50\.000\.000/)).toBeInTheDocument();
    expect(screen.getAllByText(/Hạn thanh toán: 31\/08\/2026/)).toHaveLength(2);
    // The reveal moved from the native `title` bubble to the app tooltip.
    expect(
      screen.getByRole('button', { name: /sao chép mã r1/i }),
    ).toBeInTheDocument();
  });

  it('uses business fallbacks when candidate metadata is missing', async () => {
    apiRequest.mockResolvedValue([
      {
        ...candidates[0],
        invoiceNumber: null,
        customerName: null,
        remainingAmount: null,
        dueDate: null,
      },
    ]);
    renderDialog();

    expect(await screen.findByText('Khoản phải thu')).toBeInTheDocument();
    expect(screen.getByText(/Chưa có số dư/)).toBeInTheDocument();
    expect(screen.getByText(/Chưa có hạn thanh toán/)).toBeInTheDocument();
  });

  it('keeps allocation total within the transaction amount and submits both rows', async () => {
    apiRequest.mockResolvedValue(candidates);
    renderDialog();

    await waitFor(() => expect(screen.getByText('80/100')).toBeInTheDocument());
    const inputs = screen.getAllByLabelText(/số tiền phân bổ/i);
    fireEvent.change(inputs[0], { target: { value: '30000000' } });
    fireEvent.change(inputs[1], { target: { value: '20000000' } });
    fireEvent.click(screen.getByRole('button', { name: /khớp giao dịch/i }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/bank-transactions/bt9/match',
          method: 'POST',
          data: expect.objectContaining({
            allocations: expect.arrayContaining([
              expect.objectContaining({
                receivableId: 'r1',
                amount: 30_000_000,
              }),
              expect.objectContaining({
                receivableId: 'r2',
                amount: 20_000_000,
              }),
            ]),
          }),
        }),
      ),
    );
  });

  it('blocks submit when allocation total exceeds the amount', async () => {
    apiRequest.mockResolvedValue(candidates);
    renderDialog();

    await waitFor(() => expect(screen.getByText('80/100')).toBeInTheDocument());
    const inputs = screen.getAllByLabelText(/số tiền phân bổ/i);
    fireEvent.change(inputs[0], { target: { value: '60000000' } });
    fireEvent.click(screen.getByRole('button', { name: /khớp giao dịch/i }));

    expect(apiRequest).not.toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/bank-transactions/bt9/match',
        method: 'POST',
      }),
    );
  });

  it('shows allocation errors from the backend inline', async () => {
    apiRequest.mockResolvedValueOnce(candidates).mockRejectedValueOnce({
      response: { data: { errorCode: 'ALLOCATION_EXCEEDS_REMAINING' } },
    });
    renderDialog();

    await waitFor(() => expect(screen.getByText('80/100')).toBeInTheDocument());
    fireEvent.change(screen.getAllByLabelText(/số tiền phân bổ/i)[0], {
      target: { value: '1000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /khớp giao dịch/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Số tiền vượt quá công nợ còn lại của khoản phải thu.',
    );
  });

  it('keeps long identifiers accessible without widening the dialog actions', async () => {
    const providerTransactionId = `provider-${'x'.repeat(80)}`;
    const receivableId = `receivable-${'y'.repeat(80)}`;
    apiRequest.mockResolvedValue([{ ...candidates[0], receivableId }]);
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <SplitMatchDialog
          tx={{
            ...tx,
            providerTransactionId,
            counterpartyName: null,
            transferContent: null,
          }}
          open
          onOpenChange={vi.fn()}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText('80/100')).toBeInTheDocument());

    const providerId = screen.getByText(providerTransactionId);
    const receivable = screen.getByRole('button', {
      name: `Sao chép mã ${receivableId}`,
    });
    expect(providerId).toHaveClass('truncate');
    expect(providerId).not.toHaveAttribute('title');
    expect(receivable).not.toHaveAttribute('title');
    expect(
      screen.getByRole('button', { name: /ghi nhận công nợ/i }).parentElement,
    ).toHaveClass('flex-col');
  });

  it('keeps the dialog title, description and close button reachable on a short viewport', async () => {
    apiRequest.mockResolvedValue(candidates);
    renderDialog();

    await waitFor(() => expect(screen.getByText('80/100')).toBeInTheDocument());

    // A candidate-heavy dialog must scroll inside its own body instead of
    // growing past the viewport and pushing the title and close button off
    // screen. Assert on the scroll container's class, not pixel maths, so the
    // guarantee survives jsdom's zero-height layout.
    expect(document.querySelector('[data-slot="dialog-content"]')).toHaveClass(
      'max-h-[85vh]',
      'overflow-hidden',
      'flex',
      'flex-col',
    );
    expect(
      [...document.querySelectorAll('[data-slot="dialog-content"] div')].find(
        (el) => el.classList.contains('overflow-y-auto'),
      ),
    ).toBeDefined();
    // The description belongs to the header so it inherits the header's
    // left alignment instead of the dialog's centred grid default.
    expect(
      document.querySelector(
        '[data-slot="dialog-header"] [data-slot="dialog-description"]',
      ),
    ).not.toBeNull();
  });
});

function renderWithPayer(opts?: {
  txOverrides?: Partial<BankTransaction>;
  payer?: {
    accountNumberMasked: string;
    name: string;
    linkedCustomers: { customerId: string; customerName: string }[];
  } | null;
  onOpenChange?: (v: boolean) => void;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onOpenChange = opts?.onOpenChange ?? vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <SplitMatchDialog
        tx={{ ...tx, ...opts?.txOverrides }}
        payer={
          opts?.payer ?? {
            accountNumberMasked: '****6789',
            name: 'Company C',
            linkedCustomers: [],
          }
        }
        open
        onOpenChange={onOpenChange}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

describe('remember payer account', () => {
  const REMEMBER_LABEL = 'Ghi nhớ tài khoản người chuyển cho khách hàng này';

  beforeEach(() => {
    apiRequest.mockClear();
    toastSuccess.mockClear();
    toastWarning.mockClear();
    toastError.mockClear();
  });

  it('shows the remember checkbox, checked, when the transaction has an account number', async () => {
    apiRequest.mockResolvedValue(candidates);
    renderWithPayer();
    const box = await screen.findByRole('checkbox', { name: REMEMBER_LABEL });
    expect(box).toBeChecked();
  });

  it('hides the remember checkbox when the transaction has no account number', async () => {
    apiRequest.mockResolvedValue(candidates);
    renderWithPayer({ txOverrides: { counterpartyAccountNumber: null } });
    await waitFor(() => expect(screen.getByText('80/100')).toBeInTheDocument());
    expect(
      screen.queryByRole('checkbox', { name: REMEMBER_LABEL }),
    ).not.toBeInTheDocument();
  });

  it('lets the user uncheck the remember checkbox', async () => {
    apiRequest.mockResolvedValue(candidates);
    renderWithPayer();
    const box = await screen.findByRole('checkbox', { name: REMEMBER_LABEL });
    fireEvent.click(box);
    expect(box).not.toBeChecked();
  });

  it('hides the checkbox once the chosen customer is already linked to this account', async () => {
    apiRequest.mockResolvedValue(candidates);
    renderWithPayer({
      payer: {
        accountNumberMasked: '****6789',
        name: 'Company C',
        linkedCustomers: [
          { customerId: 'c1', customerName: 'Công ty An Phát' },
        ],
      },
    });
    await waitFor(() => expect(screen.getByText('80/100')).toBeInTheDocument());
    // Before any amount: no chosen customer yet -> checkbox visible.
    expect(
      screen.getByRole('checkbox', { name: REMEMBER_LABEL }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getAllByLabelText(/số tiền phân bổ/i)[0], {
      target: { value: '1000000' },
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('checkbox', { name: REMEMBER_LABEL }),
      ).not.toBeInTheDocument(),
    );
  });

  it('auto-unchecks and warns when the account belongs to a different customer', async () => {
    apiRequest.mockResolvedValue(candidates);
    renderWithPayer({
      payer: {
        accountNumberMasked: '****6789',
        name: 'Company C',
        linkedCustomers: [
          { customerId: 'other', customerName: 'Công ty Khác' },
        ],
      },
    });
    await waitFor(() => expect(screen.getByText('80/100')).toBeInTheDocument());
    fireEvent.change(screen.getAllByLabelText(/số tiền phân bổ/i)[0], {
      target: { value: '1000000' },
    });
    const box = await screen.findByRole('checkbox', { name: REMEMBER_LABEL });
    await waitFor(() => expect(box).not.toBeChecked());
    expect(
      screen.getByText(/Tài khoản này đang liên kết với Công ty Khác/),
    ).toBeInTheDocument();
  });

  it('creates the payer link after a successful match when checked', async () => {
    apiRequest.mockImplementation((cfg: { url: string }) => {
      if (cfg.url === '/api/v1/bank-transactions/bt9/match') {
        return Promise.resolve({ id: 'bt9' });
      }
      if (cfg.url === '/api/v1/customers/c1/bank-accounts') {
        return Promise.resolve({ id: 'cba1' });
      }
      return Promise.resolve(candidates);
    });
    const { onOpenChange } = renderWithPayer();

    await waitFor(() => expect(screen.getByText('80/100')).toBeInTheDocument());
    fireEvent.change(screen.getAllByLabelText(/số tiền phân bổ/i)[0], {
      target: { value: '50000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /khớp giao dịch/i }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/customers/c1/bank-accounts',
          method: 'POST',
          data: { accountNumber: '999' },
        }),
      ),
    );
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        expect.stringContaining('Công ty An Phát'),
      ),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not create the payer link when the checkbox is unchecked', async () => {
    apiRequest.mockImplementation((cfg: { url: string }) => {
      if (cfg.url === '/api/v1/bank-transactions/bt9/match') {
        return Promise.resolve({ id: 'bt9' });
      }
      return Promise.resolve(candidates);
    });
    renderWithPayer();

    await waitFor(() => expect(screen.getByText('80/100')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('checkbox', { name: REMEMBER_LABEL }));
    fireEvent.change(screen.getAllByLabelText(/số tiền phân bổ/i)[0], {
      target: { value: '50000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /khớp giao dịch/i }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({ url: '/api/v1/bank-transactions/bt9/match' }),
      ),
    );
    expect(apiRequest).not.toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/v1/customers/c1/bank-accounts' }),
    );
  });

  it('warns and keeps the match on a cross-customer conflict from the save', async () => {
    apiRequest.mockImplementation((cfg: { url: string }) => {
      if (cfg.url === '/api/v1/bank-transactions/bt9/match') {
        return Promise.resolve({ id: 'bt9' });
      }
      if (cfg.url === '/api/v1/customers/c1/bank-accounts') {
        return Promise.reject({
          response: {
            data: {
              errorCode: 'CONFLICT',
              details: { linkedCustomerNames: ['Công ty Khác'] },
            },
          },
        });
      }
      return Promise.resolve(candidates);
    });
    const { onOpenChange } = renderWithPayer();

    await waitFor(() => expect(screen.getByText('80/100')).toBeInTheDocument());
    fireEvent.change(screen.getAllByLabelText(/số tiền phân bổ/i)[0], {
      target: { value: '50000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /khớp giao dịch/i }));

    await waitFor(() =>
      expect(toastWarning).toHaveBeenCalledWith(
        expect.stringContaining('Công ty Khác'),
      ),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false); // match still confirmed
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(); // no match error surfaced
  });

  it('shows a generic error and keeps the match when the save fails outright', async () => {
    apiRequest.mockImplementation((cfg: { url: string }) => {
      if (cfg.url === '/api/v1/bank-transactions/bt9/match') {
        return Promise.resolve({ id: 'bt9' });
      }
      if (cfg.url === '/api/v1/customers/c1/bank-accounts') {
        return Promise.reject(new Error('network down'));
      }
      return Promise.resolve(candidates);
    });
    const { onOpenChange } = renderWithPayer();

    await waitFor(() => expect(screen.getByText('80/100')).toBeInTheDocument());
    fireEvent.change(screen.getAllByLabelText(/số tiền phân bổ/i)[0], {
      target: { value: '50000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /khớp giao dịch/i }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Không ghi nhớ được tài khoản người chuyển.',
      ),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
