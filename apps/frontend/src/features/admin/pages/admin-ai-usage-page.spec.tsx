import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as adminApi from '../api/admin-api';
import { AdminAiUsagePage } from './admin-ai-usage-page';

vi.mock('../api/admin-api');

describe('AdminAiUsagePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and displays the breakdown after submitting a date range', async () => {
    vi.mocked(adminApi.getAiUsage).mockResolvedValue({
      items: [
        {
          organizationId: 'org-1',
          organizationName: 'Acme',
          model: 'gpt-5.5',
          requestCount: 42,
          totalTokens: 1000,
          errorCount: 0,
        },
      ],
    });

    render(<AdminAiUsagePage />);

    fireEvent.change(screen.getByLabelText(/từ ngày/i), {
      target: { value: '2026-08-01' },
    });
    fireEvent.change(screen.getByLabelText(/đến ngày/i), {
      target: { value: '2026-08-07' },
    });
    fireEvent.click(screen.getByRole('button', { name: /xem/i }));

    await waitFor(() =>
      expect(adminApi.getAiUsage).toHaveBeenCalledWith(
        '2026-08-01',
        '2026-08-07',
      ),
    );
    expect(await screen.findByText('Acme')).toBeInTheDocument();
    expect(await screen.findByText('1.000')).toBeInTheDocument();
  });

  it('shows named date fields and an empty state before results exist', () => {
    render(<AdminAiUsagePage />);

    expect(screen.getByLabelText(/từ ngày/i)).toHaveAttribute('name', 'from');
    expect(screen.getByLabelText(/đến ngày/i)).toHaveAttribute('name', 'to');
    expect(screen.getByText(/chưa có dữ liệu usage/i)).toBeInTheDocument();
  });

  it('announces a failed query with a next step', async () => {
    vi.mocked(adminApi.getAiUsage).mockRejectedValue(new Error('network'));

    render(<AdminAiUsagePage />);
    fireEvent.change(screen.getByLabelText(/từ ngày/i), {
      target: { value: '2026-08-01' },
    });
    fireEvent.change(screen.getByLabelText(/đến ngày/i), {
      target: { value: '2026-08-07' },
    });
    fireEvent.click(screen.getByRole('button', { name: /xem/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /không thể tải dữ liệu usage/i,
    );
  });
});
