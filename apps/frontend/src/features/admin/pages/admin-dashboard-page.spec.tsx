import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as adminApi from '../api/admin-api';
import { AdminDashboardPage } from './admin-dashboard-page';

vi.mock('../api/admin-api');

function mockOrganizationStatus() {
  vi.mocked(adminApi.listOrganizations).mockResolvedValue({
    items: [],
    total: 3,
    page: 1,
    limit: 100,
  });
}

function renderPage(element: ReactElement = <AdminDashboardPage />) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>,
  );
}

describe('AdminDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders chart titles after fetching usage data', async () => {
    mockOrganizationStatus();
    vi.mocked(adminApi.getAiUsage).mockResolvedValue({ items: [] });
    vi.mocked(adminApi.getAiUsageTrend).mockResolvedValue({ items: [] });

    renderPage();

    await waitFor(
      () =>
        expect(
          screen.getByText(/tổ chức dùng ai nhiều nhất/i),
        ).toBeInTheDocument(),
      { timeout: 5_000 },
    );
    await waitFor(() =>
      expect(screen.getByText(/xu hướng dùng ai/i)).toBeInTheDocument(),
    );
  });

  it('uses semantic headings, org summary cards, and explains empty chart states', async () => {
    mockOrganizationStatus();
    vi.mocked(adminApi.getAiUsage).mockResolvedValue({ items: [] });
    vi.mocked(adminApi.getAiUsageTrend).mockResolvedValue({ items: [] });

    renderPage();

    expect(
      await screen.findByRole('heading', { name: /tổng quan/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('header-icon')).toBeInTheDocument();
    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(screen.getByText('Tổng số tổ chức')).toBeInTheDocument();
    expect(screen.getAllByText(/chưa có dữ liệu usage/i)).toHaveLength(2);
  });

  it('announces a failed dashboard load and offers retry', async () => {
    mockOrganizationStatus();
    vi.mocked(adminApi.getAiUsage).mockRejectedValue(new Error('network'));
    vi.mocked(adminApi.getAiUsageTrend).mockResolvedValue({ items: [] });

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /không thể tải dữ liệu usage/i,
    );
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  it('deduplicates identical dashboard requests across mounted consumers', async () => {
    mockOrganizationStatus();
    vi.mocked(adminApi.getAiUsage).mockResolvedValue({ items: [] });
    vi.mocked(adminApi.getAiUsageTrend).mockResolvedValue({ items: [] });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <AdminDashboardPage />
        <AdminDashboardPage />
      </QueryClientProvider>,
    );

    expect(
      await screen.findAllByRole('heading', { name: /tổng quan/i }),
    ).toHaveLength(2);
    expect(adminApi.getAiUsage).toHaveBeenCalledTimes(1);
    expect(adminApi.getAiUsageTrend).toHaveBeenCalledTimes(1);
  });
});
