import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/contexts/auth-context';
import { AuditLogTab } from './audit-log-tab';

const { useAuditLogsMock, useOrganizationMembersMock } = vi.hoisted(() => ({
  useAuditLogsMock: vi.fn(),
  useOrganizationMembersMock: vi.fn(),
}));

vi.mock('../api/use-audit-logs', () => ({
  useAuditLogs: (...args: unknown[]) => useAuditLogsMock(...args),
}));

vi.mock('@/features/settings/api/use-settings', () => ({
  useOrganizationMembers: (...args: unknown[]) =>
    useOrganizationMembersMock(...args),
}));

vi.mock('@/contexts/auth-context', () => ({ useAuth: vi.fn() }));

const useAuthMock = vi.mocked(useAuth);

const knownMember = {
  id: 'm1',
  userId: 'user-1',
  email: 'fm@congtyb.vn',
  name: 'FM A',
  role: 'FINANCE_MANAGER',
  joinedAt: '2026-08-01',
  status: 'ACTIVE',
  blockedAt: null,
};

const logItem = {
  id: 'log-1',
  userId: 'user-1',
  actionType: 'RECEIVABLE_WRITE_OFF',
  entityType: 'Receivable',
  entityId: 'a3f8c1e2-9b4d-4e5f-8a6b-1234567890ab',
  beforeState: { status: 'OPEN' },
  afterState: { status: 'WRITTEN_OFF' },
  ipAddress: '203.0.113.7',
  createdAt: '2026-08-20T04:00:00.000Z',
};

function renderTab(initialEntries: string[] = ['/settings']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AuditLogTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockLoadedData() {
  useAuditLogsMock.mockReturnValue({
    data: { items: [logItem], total: 1 },
    isLoading: false,
    isError: false,
  });
  useOrganizationMembersMock.mockReturnValue({
    data: { items: [knownMember], total: 1, page: 1, limit: 100 },
    isLoading: false,
    isError: false,
  });
}

describe('AuditLogTab', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when the user lacks AUDIT_LOG_READ', () => {
    useAuthMock.mockReturnValue({
      user: { role: 'ACCOUNTANT', organizationId: 'org-1' },
    } as never);
    mockLoadedData();

    const { container } = renderTab();

    expect(container).toBeEmptyDOMElement();
  });

  it('resolves the actor name from organization members', () => {
    useAuthMock.mockReturnValue({
      user: { role: 'OWNER', organizationId: 'org-1' },
    } as never);
    mockLoadedData();

    renderTab();

    expect(
      screen.getByRole('heading', { level: 2, name: 'Nhật ký' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Theo dõi thay đổi và hoạt động trong tổ chức.'),
    ).toBeInTheDocument();
    expect(screen.getByText('FM A')).toBeInTheDocument();
  });

  it('shows a static label instead of a raw uuid for an unknown actor', () => {
    useAuthMock.mockReturnValue({
      user: { role: 'OWNER', organizationId: 'org-1' },
    } as never);
    useAuditLogsMock.mockReturnValue({
      data: { items: [{ ...logItem, userId: 'removed-user-id' }], total: 1 },
      isLoading: false,
      isError: false,
    });
    useOrganizationMembersMock.mockReturnValue({
      data: { items: [knownMember], total: 1, page: 1, limit: 100 },
      isLoading: false,
      isError: false,
    });

    renderTab();

    expect(screen.getByText('Người dùng đã rời tổ chức')).toBeInTheDocument();
    expect(screen.queryByText(/removed-user-id/)).not.toBeInTheDocument();
  });

  it('truncates the entity id instead of showing the raw uuid', () => {
    useAuthMock.mockReturnValue({
      user: { role: 'OWNER', organizationId: 'org-1' },
    } as never);
    mockLoadedData();

    renderTab();

    expect(screen.getByText('a3f8c1e2…')).toBeInTheDocument();
    expect(
      screen.queryByText('a3f8c1e2-9b4d-4e5f-8a6b-1234567890ab'),
    ).not.toBeInTheDocument();
  });

  it('shows a dash instead of a bare ellipsis when the entity id is empty', () => {
    useAuthMock.mockReturnValue({
      user: { role: 'OWNER', organizationId: 'org-1' },
    } as never);
    useAuditLogsMock.mockReturnValue({
      data: { items: [{ ...logItem, entityId: '' }], total: 1 },
      isLoading: false,
      isError: false,
    });
    useOrganizationMembersMock.mockReturnValue({
      data: { items: [knownMember], total: 1, page: 1, limit: 100 },
      isLoading: false,
      isError: false,
    });

    renderTab();

    expect(screen.queryByText('…')).not.toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows before/after state and ip only after expanding the row', () => {
    useAuthMock.mockReturnValue({
      user: { role: 'OWNER', organizationId: 'org-1' },
    } as never);
    mockLoadedData();

    renderTab();

    expect(screen.queryByText('203.0.113.7')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /chi tiết/i }));

    expect(screen.getByText('203.0.113.7')).toBeInTheDocument();
    expect(screen.getByText('Trạng thái')).toBeInTheDocument();
    expect(screen.queryByText('status')).not.toBeInTheDocument();
    expect(screen.getByText('OPEN')).toBeInTheDocument();
    expect(screen.getByText('WRITTEN_OFF')).toBeInTheDocument();
    expect(screen.queryByText(/"status"/)).not.toBeInTheDocument();
  });

  it('renders mobile field labels and labels both sides of expanded changes', () => {
    useAuthMock.mockReturnValue({
      user: { role: 'OWNER', organizationId: 'org-1' },
    } as never);
    mockLoadedData();

    renderTab();

    expect(
      screen.getAllByText('Thời điểm', { exact: true }).length,
    ).toBeGreaterThan(1);
    expect(
      screen.getAllByText('Người thực hiện', { exact: true }).length,
    ).toBeGreaterThan(1);
    expect(
      screen.getAllByText('Hành động', { exact: true }).length,
    ).toBeGreaterThan(1);
    expect(
      screen.getAllByText('Đối tượng', { exact: true }).length,
    ).toBeGreaterThan(1);
    expect(
      screen.getByRole('button', { name: /chi tiết/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /chi tiết/i }));

    expect(
      screen.getAllByText('Trước', { exact: true }).length,
    ).toBeGreaterThan(1);
    expect(screen.getAllByText('Sau', { exact: true }).length).toBeGreaterThan(
      1,
    );
    expect(screen.getByText('203.0.113.7')).toBeInTheDocument();
  });

  it('truncates UUID-shaped values with a copy button in the expanded detail', () => {
    useAuthMock.mockReturnValue({
      user: { role: 'OWNER', organizationId: 'org-1' },
    } as never);
    const customerId = '139b0a85-5be9-4836-96bb-32e88cdeffb1';
    useAuditLogsMock.mockReturnValue({
      data: {
        items: [
          {
            ...logItem,
            id: 'log-3',
            beforeState: null,
            afterState: { customerId },
          },
        ],
        total: 1,
      },
      isLoading: false,
      isError: false,
    });
    useOrganizationMembersMock.mockReturnValue({
      data: { items: [knownMember], total: 1, page: 1, limit: 100 },
      isLoading: false,
      isError: false,
    });

    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /chi tiết/i }));

    expect(screen.getByText('Khách hàng')).toBeInTheDocument();
    expect(screen.queryByText(customerId)).not.toBeInTheDocument();
    const copyButton = screen.getByTitle(customerId);
    expect(copyButton).toHaveTextContent('139b0a85…');
  });

  it('formats a known money field as VND in the expanded detail', () => {
    useAuthMock.mockReturnValue({
      user: { role: 'OWNER', organizationId: 'org-1' },
    } as never);
    useAuditLogsMock.mockReturnValue({
      data: {
        items: [
          {
            ...logItem,
            id: 'log-2',
            beforeState: null,
            afterState: { allocatedAmount: 500000 },
          },
        ],
        total: 1,
      },
      isLoading: false,
      isError: false,
    });
    useOrganizationMembersMock.mockReturnValue({
      data: { items: [knownMember], total: 1, page: 1, limit: 100 },
      isLoading: false,
      isError: false,
    });

    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /chi tiết/i }));

    expect(screen.getByText('500.000 ₫')).toBeInTheDocument();
  });

  it('uses Vietnamese labels for bank transaction audit fields', () => {
    useAuthMock.mockReturnValue({
      user: { role: 'OWNER', organizationId: 'org-1' },
    } as never);
    useAuditLogsMock.mockReturnValue({
      data: {
        items: [
          {
            ...logItem,
            entityType: 'BankTransaction',
            beforeState: null,
            afterState: {
              amount: 46_000_000,
              bankConnectionId: '139b0a85-5be9-4836-96bb-32e88cdeffb1',
              counterpartyAccountNumber: '0123456789',
              aiRecommendation: null,
            },
          },
        ],
        total: 1,
      },
      isLoading: false,
      isError: false,
    });
    useOrganizationMembersMock.mockReturnValue({
      data: { items: [knownMember], total: 1, page: 1, limit: 100 },
      isLoading: false,
      isError: false,
    });

    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /chi tiết/i }));

    expect(screen.getByText('Số tiền giao dịch')).toBeInTheDocument();
    expect(screen.getByText('Kết nối ngân hàng')).toBeInTheDocument();
    expect(screen.getByText('Số tài khoản đối ứng')).toBeInTheDocument();
    expect(screen.getByText('Gợi ý đối soát AI')).toBeInTheDocument();
    expect(screen.queryByText('amount')).not.toBeInTheDocument();
  });

  it('formats creditLimit and taxAmount as VND too', () => {
    useAuthMock.mockReturnValue({
      user: { role: 'OWNER', organizationId: 'org-1' },
    } as never);
    useAuditLogsMock.mockReturnValue({
      data: {
        items: [
          {
            ...logItem,
            id: 'log-3',
            beforeState: null,
            afterState: { creditLimit: 1_000_000, taxAmount: 200_000 },
          },
        ],
        total: 1,
      },
      isLoading: false,
      isError: false,
    });
    useOrganizationMembersMock.mockReturnValue({
      data: { items: [knownMember], total: 1, page: 1, limit: 100 },
      isLoading: false,
      isError: false,
    });

    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /chi tiết/i }));

    expect(screen.getByText('1.000.000 ₫')).toBeInTheDocument();
    expect(screen.getByText('200.000 ₫')).toBeInTheDocument();
  });

  it('formats date fields in the expanded detail using the shared Vietnamese formatters', () => {
    useAuthMock.mockReturnValue({
      user: { role: 'OWNER', organizationId: 'org-1' },
    } as never);
    useAuditLogsMock.mockReturnValue({
      data: {
        items: [
          {
            ...logItem,
            id: 'log-dates',
            beforeState: null,
            afterState: {
              createdAt: '2026-08-26T09:14:14.087Z',
              dueDate: '2026-11-30T00:00:00.000Z',
            },
          },
        ],
        total: 1,
      },
      isLoading: false,
      isError: false,
    });
    useOrganizationMembersMock.mockReturnValue({
      data: { items: [knownMember], total: 1, page: 1, limit: 100 },
      isLoading: false,
      isError: false,
    });

    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /chi tiết/i }));

    expect(screen.getByText('16:14 26/08/2026')).toBeInTheDocument();
    expect(screen.getByText('30/11/2026')).toBeInTheDocument();
    expect(
      screen.queryByText('2026-08-26T09:14:14.087Z'),
    ).not.toBeInTheDocument();
  });

  it('shows a resolved customer name while keeping the customer id copyable', () => {
    useAuthMock.mockReturnValue({
      user: { role: 'OWNER', organizationId: 'org-1' },
    } as never);
    const customerId = '139b0a85-5be9-4836-96bb-32e88cdeffb1';
    useAuditLogsMock.mockReturnValue({
      data: {
        items: [
          {
            ...logItem,
            id: 'log-customer-name',
            beforeState: null,
            afterState: { customerId },
            display: {
              entityLabel: null,
              customerNames: { [customerId]: 'Công ty ABC' },
              invoiceNumbers: {},
            },
          },
        ],
        total: 1,
      },
      isLoading: false,
      isError: false,
    });
    useOrganizationMembersMock.mockReturnValue({
      data: { items: [knownMember], total: 1, page: 1, limit: 100 },
      isLoading: false,
      isError: false,
    });

    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /chi tiết/i }));

    expect(screen.getByText('Công ty ABC')).toBeInTheDocument();
    expect(screen.getByTitle(customerId)).toHaveTextContent('139b0a85…');
  });

  it('maps URL search params to the audit log query', () => {
    useAuthMock.mockReturnValue({
      user: { role: 'OWNER', organizationId: 'org-1' },
    } as never);
    mockLoadedData();

    renderTab([
      '/settings?tab=audit-log&entityType=Receivable&actionType=RECEIVABLE_WRITE_OFF&page=2',
    ]);

    expect(useAuditLogsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        limit: 20,
        entityType: 'Receivable',
        actionType: 'RECEIVABLE_WRITE_OFF',
      }),
    );
  });

  it('resets the page to 1 when a filter changes', async () => {
    useAuthMock.mockReturnValue({
      user: { role: 'OWNER', organizationId: 'org-1' },
    } as never);
    mockLoadedData();

    renderTab(['/settings?tab=audit-log&page=3']);

    const entityTrigger = screen.getByRole('combobox', { name: /đối tượng/i });
    fireEvent.click(entityTrigger);
    const receivableOption = await screen.findByRole('option', {
      name: 'Khoản phải thu',
    });
    fireEvent.click(receivableOption);

    await waitFor(() =>
      expect(useAuditLogsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, entityType: 'Receivable' }),
      ),
    );
  });
});
