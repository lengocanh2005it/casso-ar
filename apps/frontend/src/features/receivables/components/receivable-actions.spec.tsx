import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WriteOffDialog } from './write-off-dialog';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { role: 'OWNER' } }),
}));

describe('WriteOffDialog', () => {
  it('confirms before calling the write-off endpoint', async () => {
    apiRequest.mockResolvedValue({ id: 'r1' });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <WriteOffDialog receivableId="r1" />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByText('Write off'));
    expect(
      screen.getByText(/accept the loss of the remaining amount/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /confirm write-off/i }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/receivables/r1/write-off',
          method: 'POST',
        }),
      ),
    );
  });
});
