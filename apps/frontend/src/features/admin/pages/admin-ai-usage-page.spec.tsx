import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import * as adminApi from '../api/admin-api';
import { AdminAiUsagePage } from './admin-ai-usage-page';

vi.mock('../api/admin-api');

describe('AdminAiUsagePage', () => {
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
  });
});
