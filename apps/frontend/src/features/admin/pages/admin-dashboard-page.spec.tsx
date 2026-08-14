import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as adminApi from '../api/admin-api';
import { AdminDashboardPage } from './admin-dashboard-page';

vi.mock('../api/admin-api');

describe('AdminDashboardPage', () => {
  it('renders chart titles after fetching usage data', async () => {
    vi.mocked(adminApi.getAiUsage).mockResolvedValue({ items: [] });
    vi.mocked(adminApi.getAiUsageTrend).mockResolvedValue({ items: [] });

    render(<AdminDashboardPage />);

    expect(await screen.findByText(/top organizations/i)).toBeInTheDocument();
    expect(await screen.findByText(/xu hướng usage/i)).toBeInTheDocument();
  });

  it('uses semantic headings and explains empty chart states', async () => {
    vi.mocked(adminApi.getAiUsage).mockResolvedValue({ items: [] });
    vi.mocked(adminApi.getAiUsageTrend).mockResolvedValue({ items: [] });

    render(<AdminDashboardPage />);

    expect(
      await screen.findByRole('heading', { name: /admin overview/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/chưa có dữ liệu usage/i)).toHaveLength(2);
  });

  it('announces a failed dashboard load and offers retry', async () => {
    vi.mocked(adminApi.getAiUsage).mockRejectedValue(new Error('network'));
    vi.mocked(adminApi.getAiUsageTrend).mockResolvedValue({ items: [] });

    render(<AdminDashboardPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /không thể tải dữ liệu usage/i,
    );
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });
});
