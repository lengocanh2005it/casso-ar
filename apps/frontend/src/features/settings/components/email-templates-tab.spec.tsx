import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmailTemplatesTab } from './email-templates-tab';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  authTokenManager: { getValidAccessToken: vi.fn().mockResolvedValue('t') },
}));
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { role: 'OWNER' } }),
}));

const template = {
  id: 't1',
  name: 'Due date reminder',
  subject: 'Payment reminder {{invoiceNumber}}',
  bodyHtml: '<p>Dear {{customerName}}…</p>',
  reminderStage: null,
  isDefault: true,
  createdAt: '2026-08-01',
  updatedAt: '2026-08-01',
};

describe('EmailTemplatesTab', () => {
  it('lists templates and renders a preview', async () => {
    apiRequest.mockResolvedValueOnce([template]).mockResolvedValueOnce({
      subject: 'Payment reminder INV-1',
      bodyHtml: '<p>Dear Company B…</p>',
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <EmailTemplatesTab />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText('Due date reminder')).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: /preview/i }));
    await waitFor(() =>
      expect(screen.getByText('Payment reminder INV-1')).toBeTruthy(),
    );
  });
});
