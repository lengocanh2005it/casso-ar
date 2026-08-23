import type { Role } from '@casso-ledger/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminRoute } from '@/routes/admin-route';
import type {
  AdminMemberItem,
  AdminOrganizationMembersResponse,
  AdminPendingInviteItem,
  OrganizationListItem,
} from '../api/admin-api';
import * as adminApi from '../api/admin-api';
import { AdminOrganizationMembersPage } from './admin-organization-members-page';

vi.mock('../api/admin-api');

const { getAccessToken, isOperatorToken, toastError } = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  isOperatorToken: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiRequest: vi.fn(),
  authTokenManager: { getAccessToken, setAccessToken: vi.fn() },
  isOperatorToken,
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isLoading: false }),
}));

vi.mock('sonner', () => ({
  toast: { error: toastError, success: vi.fn() },
}));

const organization: OrganizationListItem = {
  id: 'org-1',
  name: 'Acme',
  status: 'ACTIVE',
  createdAt: '2026-08-01T00:00:00.000Z',
};

const activeOwner: AdminMemberItem = {
  id: 'mem-1',
  userId: 'user-1',
  name: 'Nguyễn Văn A',
  email: 'a@casso.vn',
  role: 'OWNER' as Role,
  joinedAt: '2026-08-02T00:00:00.000Z',
  status: 'ACTIVE',
  blockedAt: null,
};

const blockedAccountant: AdminMemberItem = {
  id: 'mem-2',
  userId: 'user-2',
  name: 'Trần Thị B',
  email: 'b@casso.vn',
  role: 'ACCOUNTANT' as Role,
  joinedAt: '2026-08-03T00:00:00.000Z',
  status: 'BLOCKED',
  blockedAt: '2026-08-10T00:00:00.000Z',
};

const validInvite: AdminPendingInviteItem = {
  id: 'inv-1',
  email: 'moi@congtyb.vn',
  role: 'VIEWER' as Role,
  invitedAt: '2026-08-01T00:00:00.000Z',
  expiresAt: '2026-08-20T00:00:00.000Z',
};

const expiredInvite: AdminPendingInviteItem = {
  id: 'inv-2',
  email: 'het-han@congtyb.vn',
  role: 'ACCOUNTANT' as Role,
  invitedAt: '2026-07-01T00:00:00.000Z',
  expiresAt: '2026-07-08T00:00:00.000Z',
};

function buildResponse(
  overrides: Partial<AdminOrganizationMembersResponse> = {},
): AdminOrganizationMembersResponse {
  return {
    members: {
      items: [activeOwner, blockedAccountant],
      total: 2,
      page: 1,
      limit: 50,
    },
    pendingInvites: {
      items: [validInvite, expiredInvite],
      total: 2,
      page: 1,
      limit: 50,
    },
    ...overrides,
  };
}

function mockReads(
  response: AdminOrganizationMembersResponse = buildResponse(),
) {
  vi.mocked(adminApi.getAdminOrganization).mockResolvedValue(organization);
  vi.mocked(adminApi.listOrganizationMembers).mockResolvedValue(response);
}

function renderPage(initialEntry = '/admin/organizations/org-1/members') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  getAccessToken.mockReturnValue('operator-token');
  isOperatorToken.mockReturnValue(true);

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/admin/organizations/:organizationId/members"
            element={
              <AdminRoute>
                <AdminOrganizationMembersPage />
              </AdminRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdminOrganizationMembersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
  });

  describe('organization header', () => {
    it('shows the organization context with a back link to the organizations list', async () => {
      mockReads();

      renderPage();

      expect(
        await screen.findByRole('heading', { name: 'Acme' }),
      ).toBeInTheDocument();
      expect(screen.getByTestId('header-icon')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /tổ chức/i })).toHaveAttribute(
        'href',
        '/admin/organizations',
      );
      expect(screen.getByText('org-1…')).toBeInTheDocument();
      expect(screen.getByText('Đang hoạt động')).toBeInTheDocument();
    });
  });

  describe('member table', () => {
    it('shows active and blocked badges scoped to each member row', async () => {
      mockReads();

      renderPage();

      expect(await screen.findByText('Nguyễn Văn A')).toBeInTheDocument();
      const ownerRow = screen.getByText('Nguyễn Văn A').closest('tr');
      const accountantRow = screen.getByText('Trần Thị B').closest('tr');
      expect(ownerRow).not.toBeNull();
      expect(accountantRow).not.toBeNull();
      expect(
        within(ownerRow as HTMLElement).getByText('Hoạt động'),
      ).toBeInTheDocument();
      expect(
        within(accountantRow as HTMLElement).getByText('Bị chặn'),
      ).toBeInTheDocument();
    });

    it('blocks an active member and unblocks a blocked member through the correct endpoints', async () => {
      mockReads();
      vi.mocked(adminApi.blockOrganizationMember).mockResolvedValue({
        id: 'mem-1',
        userId: 'user-1',
        status: 'BLOCKED',
        blockedAt: '2026-08-11T00:00:00.000Z',
      });
      vi.mocked(adminApi.unblockOrganizationMember).mockResolvedValue({
        id: 'mem-2',
        userId: 'user-2',
        status: 'ACTIVE',
        blockedAt: null,
      });

      renderPage();

      await screen.findByText('Nguyễn Văn A');
      fireEvent.click(
        screen.getByRole('switch', { name: 'Chặn Nguyễn Văn A' }),
      );
      expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
      expect(adminApi.blockOrganizationMember).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Xác nhận chặn' }));
      await waitFor(() =>
        expect(adminApi.blockOrganizationMember).toHaveBeenCalledWith(
          'org-1',
          'user-1',
        ),
      );

      fireEvent.click(
        screen.getByRole('switch', { name: 'Bỏ chặn Trần Thị B' }),
      );
      fireEvent.click(
        await screen.findByRole('button', { name: 'Xác nhận bỏ chặn' }),
      );
      await waitFor(() =>
        expect(adminApi.unblockOrganizationMember).toHaveBeenCalledWith(
          'org-1',
          'user-2',
        ),
      );
    });

    it('warns explicitly when blocking the organization owner', async () => {
      mockReads();

      renderPage();

      await screen.findByText('Nguyễn Văn A');
      fireEvent.click(
        screen.getByRole('switch', { name: 'Chặn Nguyễn Văn A' }),
      );

      const dialog = await screen.findByRole('alertdialog');
      expect(within(dialog).getByText(/chủ sở hữu/i)).toBeInTheDocument();
    });

    it('disables the row switch while its mutation is pending', async () => {
      mockReads();
      vi.mocked(adminApi.blockOrganizationMember).mockImplementation(
        () => new Promise(() => {}),
      );

      renderPage();

      await screen.findByText('Nguyễn Văn A');
      fireEvent.click(
        screen.getByRole('switch', { name: 'Chặn Nguyễn Văn A' }),
      );
      fireEvent.click(
        await screen.findByRole('button', { name: 'Xác nhận chặn' }),
      );

      expect(
        await screen.findByRole('switch', { name: 'Chặn Nguyễn Văn A' }),
      ).toBeDisabled();
    });

    it('refetches the member list after a successful block', async () => {
      mockReads();
      vi.mocked(adminApi.blockOrganizationMember).mockResolvedValue({
        id: 'mem-1',
        userId: 'user-1',
        status: 'BLOCKED',
        blockedAt: '2026-08-11T00:00:00.000Z',
      });

      renderPage();

      await screen.findByText('Nguyễn Văn A');
      fireEvent.click(
        screen.getByRole('switch', { name: 'Chặn Nguyễn Văn A' }),
      );
      fireEvent.click(
        await screen.findByRole('button', { name: 'Xác nhận chặn' }),
      );

      await waitFor(() =>
        expect(adminApi.listOrganizationMembers).toHaveBeenCalledTimes(2),
      );
    });

    it('announces a failed block inline', async () => {
      mockReads();
      vi.mocked(adminApi.blockOrganizationMember).mockRejectedValue(
        new Error('network'),
      );

      renderPage();

      await screen.findByText('Nguyễn Văn A');
      fireEvent.click(
        screen.getByRole('switch', { name: 'Chặn Nguyễn Văn A' }),
      );
      fireEvent.click(
        await screen.findByRole('button', { name: 'Xác nhận chặn' }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /không thể cập nhật trạng thái thành viên/i,
      );
    });
  });

  describe('pending invites', () => {
    it('lists invites read-only and marks expired invites', async () => {
      mockReads();

      renderPage();

      expect(
        await screen.findByRole('heading', { name: /lời mời đang chờ/i }),
      ).toBeInTheDocument();
      expect(screen.getByText('moi@congtyb.vn')).toBeInTheDocument();
      const expiredRow = screen.getByText('het-han@congtyb.vn').closest('tr');
      expect(expiredRow).not.toBeNull();
      expect(
        within(expiredRow as HTMLElement).getByText('Đã hết hạn'),
      ).toBeInTheDocument();
    });

    it('shows resend and revoke actions for every pending invite', async () => {
      mockReads();

      renderPage();

      const inviteRow = await screen
        .findByText('moi@congtyb.vn')
        .then((element) => element.closest('tr'));
      expect(inviteRow).not.toBeNull();
      const resendButton = within(inviteRow as HTMLElement).getByRole(
        'button',
        { name: 'Gửi lại' },
      );
      const revokeButton = within(inviteRow as HTMLElement).getByRole(
        'button',
        { name: 'Thu hồi' },
      );
      expect(resendButton).toBeInTheDocument();
      expect(resendButton).toHaveClass('min-w-32');
      expect(revokeButton).toBeInTheDocument();
      expect(revokeButton).toHaveClass('min-w-32');
    });

    it('confirms before revoking a pending invite', async () => {
      mockReads();
      vi.mocked(adminApi.revokeOrganizationInvite).mockResolvedValue(undefined);

      renderPage();

      const inviteRow = await screen
        .findByText('moi@congtyb.vn')
        .then((element) => element.closest('tr'));
      fireEvent.click(
        within(inviteRow as HTMLElement).getByRole('button', {
          name: 'Thu hồi',
        }),
      );
      const dialog = await screen.findByRole('alertdialog');
      expect(within(dialog).getByText('moi@congtyb.vn')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Xác nhận thu hồi' }));

      await waitFor(() =>
        expect(adminApi.revokeOrganizationInvite).toHaveBeenCalledWith(
          'org-1',
          'inv-1',
        ),
      );
    });

    it('disables only the active invite row while resending', async () => {
      mockReads();
      vi.mocked(adminApi.resendOrganizationInvite).mockImplementation(
        () => new Promise(() => {}),
      );

      renderPage();

      const inviteRow = await screen
        .findByText('moi@congtyb.vn')
        .then((element) => element.closest('tr'));
      const otherInviteRow = screen
        .getByText('het-han@congtyb.vn')
        .closest('tr');
      fireEvent.click(
        within(inviteRow as HTMLElement).getByRole('button', {
          name: 'Gửi lại',
        }),
      );

      expect(
        await within(inviteRow as HTMLElement).findByRole('button', {
          name: 'Đang gửi lại…',
        }),
      ).toBeDisabled();
      expect(
        within(otherInviteRow as HTMLElement).getByRole('button', {
          name: 'Gửi lại',
        }),
      ).not.toBeDisabled();
    });

    it('refreshes pending invites after a successful resend', async () => {
      mockReads();
      vi.mocked(adminApi.resendOrganizationInvite).mockResolvedValue({
        success: true,
      });

      renderPage();

      const inviteRow = await screen
        .findByText('moi@congtyb.vn')
        .then((element) => element.closest('tr'));
      fireEvent.click(
        within(inviteRow as HTMLElement).getByRole('button', {
          name: 'Gửi lại',
        }),
      );

      await waitFor(() =>
        expect(adminApi.listOrganizationMembers).toHaveBeenCalledTimes(2),
      );
    });

    it('shows failure feedback when resending fails', async () => {
      mockReads();
      vi.mocked(adminApi.resendOrganizationInvite).mockRejectedValue(
        new Error('network'),
      );

      renderPage();

      const inviteRow = await screen
        .findByText('moi@congtyb.vn')
        .then((element) => element.closest('tr'));
      fireEvent.click(
        within(inviteRow as HTMLElement).getByRole('button', {
          name: 'Gửi lại',
        }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /không thể gửi lại lời mời/i,
      );
      expect(toastError).toHaveBeenCalledWith(
        'Không thể gửi lại lời mời. Vui lòng thử lại.',
      );
    });

    it('shows revoke loading state while revoking', async () => {
      mockReads();
      vi.mocked(adminApi.revokeOrganizationInvite).mockImplementation(
        () => new Promise(() => {}),
      );

      renderPage();

      const inviteRow = await screen
        .findByText('moi@congtyb.vn')
        .then((element) => element.closest('tr'));
      fireEvent.click(
        within(inviteRow as HTMLElement).getByRole('button', {
          name: 'Thu hồi',
        }),
      );
      fireEvent.click(
        await screen.findByRole('button', { name: 'Xác nhận thu hồi' }),
      );

      expect(
        await within(inviteRow as HTMLElement).findByRole('button', {
          name: 'Đang thu hồi…',
        }),
      ).toBeDisabled();
    });

    it('shows failure feedback when revoking fails', async () => {
      mockReads();
      vi.mocked(adminApi.revokeOrganizationInvite).mockRejectedValue(
        new Error('network'),
      );

      renderPage();

      const inviteRow = await screen
        .findByText('moi@congtyb.vn')
        .then((element) => element.closest('tr'));
      fireEvent.click(
        within(inviteRow as HTMLElement).getByRole('button', {
          name: 'Thu hồi',
        }),
      );
      fireEvent.click(
        await screen.findByRole('button', { name: 'Xác nhận thu hồi' }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /không thể thu hồi lời mời/i,
      );
      expect(toastError).toHaveBeenCalledWith(
        'Không thể thu hồi lời mời. Vui lòng thử lại.',
      );
    });
  });

  describe('URL-backed filters and pagination', () => {
    it('changes status through the select and resets the page', async () => {
      mockReads();

      renderPage('/admin/organizations/org-1/members?page=2');

      await screen.findByText('Nguyễn Văn A');
      fireEvent.click(
        screen.getByRole('combobox', { name: 'Trạng thái thành viên' }),
      );
      fireEvent.click(await screen.findByRole('option', { name: 'Bị chặn' }));

      await waitFor(() =>
        expect(adminApi.listOrganizationMembers).toHaveBeenLastCalledWith(
          'org-1',
          { page: 1, limit: 50, status: 'BLOCKED', search: '' },
        ),
      );
    });

    it('searches by name or email through the URL', async () => {
      mockReads();

      renderPage();

      await screen.findByText('Nguyễn Văn A');
      fireEvent.change(
        screen.getByRole('textbox', { name: 'Tìm tên hoặc email' }),
        { target: { value: 'acme' } },
      );

      await waitFor(() =>
        expect(adminApi.listOrganizationMembers).toHaveBeenLastCalledWith(
          'org-1',
          { page: 1, limit: 50, status: 'ALL', search: 'acme' },
        ),
      );
    });

    it('debounces the search input before refetching', async () => {
      mockReads();

      renderPage();
      await screen.findByText('Nguyễn Văn A');
      expect(adminApi.listOrganizationMembers).toHaveBeenCalledTimes(1);

      vi.useFakeTimers();
      try {
        fireEvent.change(
          screen.getByRole('textbox', { name: 'Tìm tên hoặc email' }),
          { target: { value: 'acme' } },
        );
        vi.advanceTimersByTime(299);
        expect(adminApi.listOrganizationMembers).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(1);
      } finally {
        vi.useRealTimers();
      }

      await waitFor(() =>
        expect(adminApi.listOrganizationMembers).toHaveBeenLastCalledWith(
          'org-1',
          { page: 1, limit: 50, status: 'ALL', search: 'acme' },
        ),
      );
    });

    it('trims whitespace around the search term before querying', async () => {
      mockReads();

      renderPage();

      await screen.findByText('Nguyễn Văn A');
      fireEvent.change(
        screen.getByRole('textbox', { name: 'Tìm tên hoặc email' }),
        { target: { value: '  acme  ' } },
      );

      await waitFor(() =>
        expect(adminApi.listOrganizationMembers).toHaveBeenLastCalledWith(
          'org-1',
          { page: 1, limit: 50, status: 'ALL', search: 'acme' },
        ),
      );
    });

    it('normalizes invalid status and page values from the URL', async () => {
      mockReads();

      renderPage('/admin/organizations/org-1/members?status=BOGUS&page=abc');

      await screen.findByText('Nguyễn Văn A');
      expect(adminApi.listOrganizationMembers).toHaveBeenCalledWith('org-1', {
        page: 1,
        limit: 50,
        status: 'ALL',
        search: '',
      });
    });

    it('paginates through a shared footer', async () => {
      mockReads(
        buildResponse({
          members: {
            items: [activeOwner],
            total: 51,
            page: 1,
            limit: 50,
          },
        }),
      );

      renderPage();

      expect(await screen.findByText(/trang 1 \/ 2/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Sau' }));

      await waitFor(() =>
        expect(adminApi.listOrganizationMembers).toHaveBeenLastCalledWith(
          'org-1',
          { page: 2, limit: 50, status: 'ALL', search: '' },
        ),
      );
    });
  });

  describe('async states', () => {
    it('announces the member loading state with skeleton rows', async () => {
      vi.mocked(adminApi.getAdminOrganization).mockResolvedValue(organization);
      vi.mocked(adminApi.listOrganizationMembers).mockImplementation(
        () => new Promise(() => {}),
      );

      renderPage();

      expect(
        await screen.findAllByRole('status', { name: /đang tải dữ liệu/i }),
      ).toHaveLength(2);
    });

    it('shows empty states for both collections', async () => {
      mockReads(
        buildResponse({
          members: { items: [], total: 0, page: 1, limit: 50 },
          pendingInvites: { items: [], total: 0, page: 1, limit: 50 },
        }),
      );

      renderPage();

      expect(
        await screen.findByText('Chưa có thành viên.'),
      ).toBeInTheDocument();
      expect(screen.getByText('Chưa có lời mời đang chờ.')).toBeInTheDocument();
    });

    it('announces a failed member load and offers retry', async () => {
      vi.mocked(adminApi.getAdminOrganization).mockResolvedValue(organization);
      vi.mocked(adminApi.listOrganizationMembers).mockRejectedValue(
        new Error('network'),
      );

      renderPage();

      expect(
        await screen.findByText(/không thể tải danh sách thành viên/i),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Thử lại' }),
      ).toBeInTheDocument();
    });

    it('shows a pending-invites error instead of an empty state when the request fails', async () => {
      vi.mocked(adminApi.getAdminOrganization).mockResolvedValue(organization);
      vi.mocked(adminApi.listOrganizationMembers).mockRejectedValue(
        new Error('network'),
      );

      renderPage();

      expect(
        await screen.findByText(/không thể tải lời mời đang chờ/i),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Chưa có lời mời đang chờ.'),
      ).not.toBeInTheDocument();
    });
  });

  describe('route harness', () => {
    it('loads the organization and its members through the admin route harness', async () => {
      mockReads();

      renderPage();

      expect(await screen.findByText('Acme')).toBeInTheDocument();
      expect(adminApi.getAdminOrganization).toHaveBeenCalledWith('org-1');
      expect(adminApi.listOrganizationMembers).toHaveBeenCalledWith('org-1', {
        page: 1,
        limit: 50,
        status: 'ALL',
        search: '',
      });
    });

    it('reads search and status from the URL when loading members', async () => {
      mockReads();

      renderPage(
        '/admin/organizations/org-1/members?status=BLOCKED&search=acme',
      );

      expect(
        await screen.findByRole('heading', { name: /acme/i }),
      ).toBeInTheDocument();
      expect(adminApi.listOrganizationMembers).toHaveBeenCalledWith('org-1', {
        page: 1,
        limit: 50,
        status: 'BLOCKED',
        search: 'acme',
      });
    });
  });
});
