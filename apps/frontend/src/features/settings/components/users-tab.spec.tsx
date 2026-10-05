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
  members?: { status: string }[];
  invites?: unknown[];
} = {}) {
  apiRequest.mockImplementation((config: { url: string }) => {
    if (config.url.includes('/invites')) {
      const url = new URL(config.url, 'http://localhost');
      const page = Number(url.searchParams.get('page') ?? 1);
      const limit = Number(url.searchParams.get('limit') ?? 20);
      const start = (page - 1) * limit;
      return Promise.resolve({
        items: invites.slice(start, start + limit),
        total: invites.length,
        page,
        limit,
      });
    }
    const url = new URL(config.url, 'http://localhost');
    const page = Number(url.searchParams.get('page') ?? 1);
    const limit = Number(url.searchParams.get('limit') ?? 20);
    const status = url.searchParams.get('status');
    const filtered = status
      ? members.filter((member) => member.status === status)
      : members;
    const start = (page - 1) * limit;
    return Promise.resolve({
      items: filtered.slice(start, start + limit),
      total: filtered.length,
      page,
      limit,
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

  it('never offers OWNER as a selectable role', async () => {
    useAuth.mockReturnValue({
      user: { id: 'owner-1', role: 'OWNER', organizationId: 'org-1' },
    });
    mockApi();
    renderTab();

    expect(
      screen.getByRole('heading', { level: 2, name: 'Người dùng' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Quản lý thành viên, vai trò và lời mời trong tổ chức.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email').parentElement).toHaveClass(
      'space-y-2',
    );
    expect(
      screen.getByRole('combobox', { name: 'Vai trò' }).closest('.space-y-2'),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Kế toán')).toBeTruthy());

    fireEvent.click(screen.getByRole('combobox', { name: 'Vai trò' }));
    expect(await screen.findByRole('option', { name: 'Kế toán' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Chủ sở hữu' })).toBeNull();
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

  it('shows an active badge for an unblocked member', async () => {
    useAuth.mockReturnValue({
      user: { id: 'owner-1', role: 'OWNER', organizationId: 'org-1' },
    });
    mockApi({ members: [ownerMember, accountantMember] });
    renderTab();

    await waitFor(() =>
      expect(screen.getByText('ke-toan@congtyb.vn')).toBeTruthy(),
    );
    const activeRow = screen.getByText('ke-toan@congtyb.vn').closest('tr');
    expect(activeRow).not.toBeNull();
    expect(
      within(activeRow as HTMLElement).getByText('Đang hoạt động'),
    ).toBeTruthy();
  });

  it('shows member rows as labeled cards on narrow screens', async () => {
    useAuth.mockReturnValue({
      user: { id: 'owner-1', role: 'OWNER', organizationId: 'org-1' },
    });
    mockApi();
    renderTab();

    const email = await screen.findByText('ke-toan@congtyb.vn');
    const row = email.closest('tr');
    expect(row).not.toBeNull();
    expect(row).toHaveClass('max-lg:grid');
    expect(within(row as HTMLElement).getByText('Email')).toHaveClass(
      'lg:hidden',
    );
    expect(within(row as HTMLElement).getByText('Vai trò')).toHaveClass(
      'lg:hidden',
    );
    expect(within(row as HTMLElement).getByText('Trạng thái')).toHaveClass(
      'lg:hidden',
    );
    const removeButton = within(row as HTMLElement).getByRole('button', {
      name: 'Xoá Kế toán',
    });
    expect(within(removeButton).getByText('Xoá')).toHaveClass('lg:hidden');
    const ownerEmail = screen.getByText('owner@congtyb.vn');
    expect(
      within(ownerEmail.closest('tr') as HTMLElement).queryByText('Thao tác'),
    ).toBeNull();
    expect(
      screen.getByRole('columnheader', { name: 'Tên' }).closest('thead'),
    ).toHaveClass('max-lg:hidden');
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

    await screen.findByText('Sales bị chặn');
    const membersTable = screen.getByRole('table');
    await waitFor(() => {
      expect(within(membersTable).queryByText('Kế toán')).toBeNull();
      expect(within(membersTable).getByText('Sales bị chặn')).toBeTruthy();
    });
    expect(apiRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: '/api/v1/organizations/org-1/members?page=1&limit=20&status=BLOCKED',
        method: 'GET',
      }),
    );
  });

  it('paginates members and pending invites independently when both exceed 20', async () => {
    useAuth.mockReturnValue({
      user: { id: 'owner-1', role: 'OWNER', organizationId: 'org-1' },
    });
    const manyMembers = Array.from({ length: 45 }, (_, index) => ({
      ...accountantMember,
      id: `member-${index + 1}`,
      userId: `user-${index + 1}`,
      email: `member-${index + 1}@example.test`,
      name: `Thành viên ${index + 1}`,
    }));
    const manyInvites = Array.from({ length: 43 }, (_, index) => ({
      id: `invite-${index + 1}`,
      email: `invite-${index + 1}@example.test`,
      role: 'ACCOUNTANT',
      invitedAt: '2026-08-01T00:00:00.000Z',
      expiresAt: '2026-09-01T00:00:00.000Z',
    }));
    mockApi({ members: manyMembers, invites: manyInvites });
    renderTab();

    await waitFor(() => {
      expect(screen.getByText('member-1@example.test')).toBeTruthy();
      expect(screen.getByText('invite-1@example.test')).toBeTruthy();
    });
    expect(screen.queryByText('member-21@example.test')).toBeNull();
    expect(screen.queryByText('invite-21@example.test')).toBeNull();
    expect(screen.getByText(/1–20 \/ 45 thành viên/)).toBeTruthy();
    expect(screen.getByText(/1–20 \/ 43 lời mời/)).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Trang thành viên tiếp theo' }),
    );
    await waitFor(() =>
      expect(screen.getByText('member-21@example.test')).toBeTruthy(),
    );
    expect(screen.queryByText('member-1@example.test')).toBeNull();
    expect(screen.getByText('invite-1@example.test')).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Trang lời mời tiếp theo' }),
    );
    await waitFor(() =>
      expect(screen.getByText('invite-21@example.test')).toBeTruthy(),
    );
    expect(screen.queryByText('invite-1@example.test')).toBeNull();
    expect(screen.getByText('member-21@example.test')).toBeTruthy();
  });

  it('returns to the last valid invites page after revoking its final row', async () => {
    useAuth.mockReturnValue({
      user: { id: 'owner-1', role: 'OWNER', organizationId: 'org-1' },
    });
    let invites = Array.from({ length: 21 }, (_, index) => ({
      id: `invite-${index + 1}`,
      email: `invite-${index + 1}@example.test`,
      role: 'ACCOUNTANT',
      invitedAt: '2026-08-01T00:00:00.000Z',
      expiresAt: '2026-09-01T00:00:00.000Z',
    }));
    apiRequest.mockImplementation(
      (config: { url: string; method?: string }) => {
        const url = new URL(config.url, 'http://localhost');
        if (url.pathname.includes('/invites') && config.method === 'DELETE') {
          const inviteId = url.pathname.split('/').at(-1);
          invites = invites.filter((invite) => invite.id !== inviteId);
          return Promise.resolve(undefined);
        }
        if (url.pathname.includes('/invites')) {
          const page = Number(url.searchParams.get('page') ?? 1);
          const limit = Number(url.searchParams.get('limit') ?? 20);
          const start = (page - 1) * limit;
          return Promise.resolve({
            items: invites.slice(start, start + limit),
            total: invites.length,
            page,
            limit,
          });
        }
        return Promise.resolve({
          items: [ownerMember, accountantMember],
          total: 2,
          page: 1,
          limit: 20,
        });
      },
    );
    renderTab();

    await screen.findByText('invite-1@example.test');
    fireEvent.click(
      screen.getByRole('button', { name: 'Trang lời mời tiếp theo' }),
    );
    await screen.findByText('invite-21@example.test');
    const inviteRow = screen
      .getByText('invite-21@example.test')
      .closest('tr') as HTMLElement;
    fireEvent.click(within(inviteRow).getByRole('button', { name: 'Thu hồi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await screen.findByText('invite-1@example.test');
    expect(screen.queryByText('invite-21@example.test')).toBeNull();
    expect(screen.getByText(/1–20 \/ 20 lời mời/)).toBeTruthy();
    expect(screen.queryByText('Không có lời mời nào đang chờ.')).toBeNull();
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

  it('renders the transfer ownership button only for OWNER', async () => {
    useAuth.mockReturnValue({
      user: { id: 'fm-1', role: 'FINANCE_MANAGER', organizationId: 'org-1' },
    });
    mockApi();
    const { unmount } = renderTab();
    await waitFor(() => expect(screen.getByText('Kế toán')).toBeTruthy());
    expect(
      screen.queryByRole('button', { name: 'Chuyển quyền sở hữu' }),
    ).toBeNull();
    unmount();

    useAuth.mockReturnValue({
      user: { id: 'owner-1', role: 'OWNER', organizationId: 'org-1' },
    });
    renderTab();
    await waitFor(() => expect(screen.getByText('Kế toán')).toBeTruthy());
    expect(
      screen.getByRole('button', { name: 'Chuyển quyền sở hữu' }),
    ).toBeTruthy();
  });
});
