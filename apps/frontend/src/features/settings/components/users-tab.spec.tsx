import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { UsersTab } from './users-tab';

const { apiRequest, useAuth } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data?: unknown) =>
    apiRequest({ url, method: 'POST', data }),
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth }));

const ownerMember = {
  id: 'm1',
  userId: 'owner-1',
  email: 'owner@congtyb.vn',
  name: 'Chủ sở hữu',
  role: 'OWNER',
  joinedAt: '2026-08-01',
  status: 'ACTIVE',
  blockedAt: null,
};
const accountantMember = {
  id: 'm2',
  userId: 'user-2',
  email: 'ke-toan@congtyb.vn',
  name: 'Kế toán',
  role: 'ACCOUNTANT',
  joinedAt: '2026-08-01',
  status: 'ACTIVE',
  blockedAt: null,
};
const blockedMember = {
  id: 'm3',
  userId: 'user-3',
  email: 'sales@congtyb.vn',
  name: 'Sales bị chặn',
  role: 'SALES_REP',
  joinedAt: '2026-08-01',
  status: 'BLOCKED',
  blockedAt: '2026-08-10T00:00:00.000Z',
};

function mockApi({
  members = [ownerMember, accountantMember],
  invites = [],
}: {
  members?: unknown[];
  invites?: unknown[];
} = {}) {
  apiRequest.mockImplementation((config: { url: string }) => {
    if (config.url.includes('/invites')) {
      return Promise.resolve({
        items: invites,
        total: invites.length,
        page: 1,
        limit: 100,
      });
    }
    return Promise.resolve({
      items: members,
      total: members.length,
      page: 1,
      limit: 100,
    });
  });
}

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UsersTab />
    </QueryClientProvider>,
  );
}

describe('UsersTab', () => {
  beforeAll(() => {
    // jsdom does not implement scrollIntoView; radix Select calls it when
    // focusing the selected option.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("lets an OWNER change another member's role", async () => {
    useAuth.mockReturnValue({
      user: { id: 'owner-1', role: 'OWNER', organizationId: 'org-1' },
    });
    mockApi();
    renderTab();

    await waitFor(() => expect(screen.getByText('Kế toán')).toBeTruthy());
    fireEvent.click(
      screen.getByRole('combobox', { name: 'Vai trò của Kế toán' }),
    );
    fireEvent.click(await screen.findByRole('option', { name: 'Người xem' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/organizations/org-1/members/user-2',
          method: 'PATCH',
          data: { role: 'VIEWER' },
        }),
      ),
    );
  });

  it('confirms before removing a member', async () => {
    useAuth.mockReturnValue({
      user: { id: 'owner-1', role: 'OWNER', organizationId: 'org-1' },
    });
    mockApi();
    renderTab();

    await waitFor(() => expect(screen.getByText('Kế toán')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Xoá Kế toán' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/organizations/org-1/members/user-2',
          method: 'DELETE',
        }),
      ),
    );
  });

  it("hides role select and remove button on the current user's own row", async () => {
    useAuth.mockReturnValue({
      user: { id: 'owner-1', role: 'OWNER', organizationId: 'org-1' },
    });
    mockApi();
    renderTab();

    await waitFor(() =>
      expect(screen.getAllByText('Chủ sở hữu').length).toBeGreaterThan(0),
    );
    expect(screen.queryByLabelText('Vai trò của Chủ sở hữu')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xoá Chủ sở hữu' })).toBeNull();
  });

  it('hides management actions for a non-OWNER', async () => {
    useAuth.mockReturnValue({
      user: {
        id: 'fm-1',
        role: 'FINANCE_MANAGER',
        organizationId: 'org-1',
      },
    });
    mockApi();
    renderTab();

    await waitFor(() => expect(screen.getByText('Kế toán')).toBeTruthy());
    expect(screen.queryByLabelText('Vai trò của Kế toán')).toBeNull();
    expect(screen.queryByRole('button', { name: /Xoá/ })).toBeNull();
  });

  it('shows a blocked badge and lets an OWNER unblock a blocked member', async () => {
    useAuth.mockReturnValue({
      user: { id: 'owner-1', role: 'OWNER', organizationId: 'org-1' },
    });
    mockApi({ members: [ownerMember, blockedMember] });
    renderTab();

    await waitFor(() => expect(screen.getByText('Sales bị chặn')).toBeTruthy());
    const blockedRow = screen.getByText('Sales bị chặn').closest('tr');
    expect(blockedRow).not.toBeNull();
    expect(within(blockedRow as HTMLElement).getByText('Đã chặn')).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Bỏ chặn Sales bị chặn' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/organizations/org-1/members/user-3/unblock',
          method: 'POST',
        }),
      ),
    );
  });

  it('lets an OWNER block an active member', async () => {
    useAuth.mockReturnValue({
      user: { id: 'owner-1', role: 'OWNER', organizationId: 'org-1' },
    });
    mockApi();
    renderTab();

    await waitFor(() => expect(screen.getByText('Kế toán')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Chặn Kế toán' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/organizations/org-1/members/user-2/block',
          method: 'POST',
        }),
      ),
    );
  });

  it('filters the member list by status', async () => {
    useAuth.mockReturnValue({
      user: { id: 'owner-1', role: 'OWNER', organizationId: 'org-1' },
    });
    mockApi({ members: [ownerMember, accountantMember, blockedMember] });
    renderTab();

    await waitFor(() => expect(screen.getByText('Sales bị chặn')).toBeTruthy());
    fireEvent.click(
      screen.getByRole('combobox', { name: 'Lọc theo trạng thái' }),
    );
    fireEvent.click(await screen.findByRole('option', { name: 'Đã chặn' }));

    const membersTable = screen.getByRole('table');
    expect(within(membersTable).queryByText('Kế toán')).toBeNull();
    expect(within(membersTable).getByText('Sales bị chặn')).toBeTruthy();
  });

  it('flips the member to blocked optimistically while the request is pending', async () => {
    useAuth.mockReturnValue({
      user: { id: 'owner-1', role: 'OWNER', organizationId: 'org-1' },
    });
    mockApi();
    renderTab();

    await waitFor(() => expect(screen.getByText('Kế toán')).toBeTruthy());
    let resolveBlock!: (value: unknown) => void;
    apiRequest.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveBlock = resolve;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Chặn Kế toán' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Bỏ chặn Kế toán' }),
      ).toBeTruthy(),
    );

    resolveBlock({
      id: 'm2',
      userId: 'user-2',
      status: 'BLOCKED',
      blockedAt: null,
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Chặn Kế toán' })).toBeTruthy(),
    );
  });

  it('shows an empty state when there are no members', async () => {
    useAuth.mockReturnValue({
      user: { id: 'owner-1', role: 'OWNER', organizationId: 'org-1' },
    });
    mockApi({ members: [] });
    renderTab();

    await waitFor(() =>
      expect(screen.getByText('Chưa có thành viên nào.')).toBeTruthy(),
    );
  });
});
