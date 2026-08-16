import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import * as adminApi from '../api/admin-api';
import { AdminOrganizationsPage } from './admin-organizations-page';

vi.mock('../api/admin-api');

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdminOrganizationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdminOrganizationsPage', () => {
  it('lists organizations and locks one via the breaker switch', async () => {
    vi.mocked(adminApi.listOrganizations).mockResolvedValue({
      items: [
        {
          id: 'org-1',
          name: 'Acme',
          status: 'ACTIVE',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 100,
    });
    vi.mocked(adminApi.lockOrganization).mockResolvedValue({
      status: 'LOCKED',
    });

    renderPage();

    expect(await screen.findByText('Acme')).toBeInTheDocument();
    expect(adminApi.listOrganizations).toHaveBeenCalledWith(1, 50);
    const toggle = screen.getByRole('switch', { name: /acme/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);

    expect(await screen.findByRole('alertdialog')).toHaveClass(
      'overscroll-contain',
    );
    expect(adminApi.lockOrganization).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận khóa' }));

    await waitFor(() =>
      expect(adminApi.lockOrganization).toHaveBeenCalledWith('org-1'),
    );
  });

  it('shows accessible loading and empty states', async () => {
    vi.mocked(adminApi.listOrganizations).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 100,
    });

    renderPage();

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(await screen.findByText(/chưa có tổ chức nào/i)).toBeInTheDocument();
  });

  it('announces a failed organization load with retry', async () => {
    vi.mocked(adminApi.listOrganizations).mockRejectedValue(
      new Error('network'),
    );

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /không thể tải danh sách tổ chức/i,
    );
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  it('keeps the switch label meaningful when an organization name is empty', async () => {
    vi.mocked(adminApi.listOrganizations).mockResolvedValue({
      items: [
        {
          id: 'org-1',
          name: '',
          status: 'ACTIVE',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 100,
    });

    renderPage();

    expect(
      await screen.findByRole('switch', { name: /tổ chức này/i }),
    ).toBeInTheDocument();
  });

  it('links each organization row to its members page', async () => {
    vi.mocked(adminApi.listOrganizations).mockResolvedValue({
      items: [
        {
          id: 'org-1',
          name: 'Acme',
          status: 'ACTIVE',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 100,
    });

    renderPage();

    expect(
      await screen.findByRole('link', { name: 'Thành viên' }),
    ).toHaveAttribute('href', '/admin/organizations/org-1/members');
  });

  it('paginates organizations through the URL without loading more than 50 rows', async () => {
    vi.mocked(adminApi.listOrganizations)
      .mockResolvedValueOnce({
        items: [
          {
            id: 'org-1',
            name: 'Acme',
            status: 'ACTIVE',
            createdAt: '2026-08-01T00:00:00.000Z',
          },
        ],
        total: 51,
        page: 1,
        limit: 50,
      })
      .mockResolvedValueOnce({
        items: [],
        total: 51,
        page: 2,
        limit: 50,
      });

    renderPage();

    expect(await screen.findByRole('button', { name: 'Sau' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Sau' }));

    await waitFor(() =>
      expect(adminApi.listOrganizations).toHaveBeenLastCalledWith(2, 50),
    );
  });
});
