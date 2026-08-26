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
    expect(screen.getByText('status')).toBeInTheDocument();
    expect(screen.getByText('OPEN')).toBeInTheDocument();
    expect(screen.getByText('WRITTEN_OFF')).toBeInTheDocument();
    expect(screen.queryByText(/"status"/)).not.toBeInTheDocument();
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
