import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminRoute } from '@/routes/admin-route';
import * as adminApi from '../api/admin-api';
import { AdminOrganizationMembersPage } from './admin-organization-members-page';

vi.mock('../api/admin-api');

const { getAccessToken, isOperatorToken } = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  isOperatorToken: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiRequest: vi.fn(),
  authTokenManager: { getAccessToken, setAccessToken: vi.fn() },
  isOperatorToken,
}));

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

function mockReads() {
  vi.mocked(adminApi.getAdminOrganization).mockResolvedValue({
    id: 'org-1',
    name: 'Acme',
    status: 'ACTIVE',
    createdAt: '2026-08-01T00:00:00.000Z',
  });
  vi.mocked(adminApi.listOrganizationMembers).mockResolvedValue({
    members: { items: [], total: 0, page: 1, limit: 50 },
    pendingInvites: { items: [], total: 0, page: 1, limit: 50 },
  });
}

describe('AdminOrganizationMembersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

    renderPage('/admin/organizations/org-1/members?status=BLOCKED&search=acme');

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
