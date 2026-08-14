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
});
