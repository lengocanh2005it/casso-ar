import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/contexts/auth-context';
import { WebhookInboxTab } from './webhook-inbox-tab';

const { apiRequest, useWebhookInboxMock } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  useWebhookInboxMock: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data?: unknown, headers?: unknown) =>
    apiRequest({
      url,
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': 'test-key', ...(headers as object) },
    }),
}));

vi.mock('../api/use-webhook-inbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/use-webhook-inbox')>()),
  useWebhookInbox: (...args: unknown[]) => useWebhookInboxMock(...args),
}));

vi.mock('@/contexts/auth-context', () => ({ useAuth: vi.fn() }));

const useAuthMock = vi.mocked(useAuth);

const failedItem = {
  id: 'wh-1',
  bankConnectionId: 'bc-1',
  providerTransactionId: 'TXN-001',
  rawPayload: { amount: 100000 },
  receivedAt: '2026-08-20T04:00:00.000Z',
  status: 'FAILED' as const,
  processedAt: null,
  errorMessage: 'Không tìm thấy khách hàng phù hợp',
  retryCount: 1,
};

const processedItem = {
  ...failedItem,
  id: 'wh-2',
  status: 'PROCESSED' as const,
  errorMessage: null,
  processedAt: '2026-08-20T04:05:00.000Z',
};

function renderTab(initialEntries: string[] = ['/settings']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <WebhookInboxTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('WebhookInboxTab', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when the user lacks WEBHOOK_INBOX_READ', () => {
    useAuthMock.mockReturnValue({
      user: { role: 'ACCOUNTANT', organizationId: 'org-1' },
    } as never);
    useWebhookInboxMock.mockReturnValue({
      data: { items: [failedItem], total: 1 },
      isLoading: false,
      isError: false,
    });

    const { container } = renderTab();

    expect(container).toBeEmptyDOMElement();
  });

  it('renders webhook items from the query, and shows "Xử lý lại" only on FAILED rows', () => {
    useAuthMock.mockReturnValue({
      user: { role: 'OWNER', organizationId: 'org-1' },
    } as never);
    useWebhookInboxMock.mockReturnValue({
      data: { items: [failedItem, processedItem], total: 2 },
      isLoading: false,
      isError: false,
    });

    renderTab();

    expect(
      screen.getByRole('heading', { level: 2, name: 'Webhook' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Theo dõi giao dịch nhận từ Casso Flow / Casso Balance Hook.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Thất bại')).toBeInTheDocument();
    expect(screen.getByText('Đã xử lý')).toBeInTheDocument();
    expect(screen.getAllByText('TXN-001…')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Xử lý lại' })).toHaveLength(
      1,
    );
  });

  it('renders mobile field labels alongside webhook data and row actions', () => {
    useAuthMock.mockReturnValue({
      user: { role: 'OWNER', organizationId: 'org-1' },
    } as never);
    useWebhookInboxMock.mockReturnValue({
      data: { items: [failedItem], total: 1 },
      isLoading: false,
      isError: false,
    });

    renderTab();

    expect(
      screen.getAllByText('Thời điểm nhận', { exact: true }).length,
    ).toBeGreaterThan(1);
    expect(
      screen.getAllByText('Trạng thái', { exact: true }).length,
    ).toBeGreaterThan(1);
    expect(
      screen.getAllByText('Mã giao dịch', { exact: true }).length,
    ).toBeGreaterThan(1);
    expect(
      screen.getAllByText('Số lần thử lại', { exact: true }).length,
    ).toBeGreaterThan(1);
    expect(
      screen.getByRole('button', { name: 'Chi tiết' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Xử lý lại' }),
    ).toBeInTheDocument();
  });

  it('reprocesses a FAILED webhook on confirm', async () => {
    useAuthMock.mockReturnValue({
      user: { role: 'OWNER', organizationId: 'org-1' },
    } as never);
    useWebhookInboxMock.mockReturnValue({
      data: { items: [failedItem], total: 1 },
      isLoading: false,
      isError: false,
    });
    apiRequest.mockResolvedValueOnce({ ...failedItem, status: 'PROCESSED' });

    renderTab();

    fireEvent.click(screen.getByRole('button', { name: 'Xử lý lại' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/webhooks/inbox/wh-1/reprocess',
          method: 'POST',
        }),
      ),
    );
  });

  it('maps the status filter from the URL into the query', () => {
    useAuthMock.mockReturnValue({
      user: { role: 'OWNER', organizationId: 'org-1' },
    } as never);
    useWebhookInboxMock.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      isError: false,
    });

    renderTab(['/settings?tab=webhook-inbox&status=FAILED']);

    expect(useWebhookInboxMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED', page: 1, limit: 20 }),
    );
  });

  it('resets the page to 1 when the status filter changes', async () => {
    useAuthMock.mockReturnValue({
      user: { role: 'OWNER', organizationId: 'org-1' },
    } as never);
    useWebhookInboxMock.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      isError: false,
    });

    renderTab(['/settings?tab=webhook-inbox&page=3']);

    const statusTrigger = screen.getByRole('combobox', { name: /trạng thái/i });
    fireEvent.click(statusTrigger);
    const failedOption = await screen.findByRole('option', {
      name: 'Thất bại',
    });
    fireEvent.click(failedOption);

    await waitFor(() =>
      expect(useWebhookInboxMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, status: 'FAILED' }),
      ),
    );
  });
});
