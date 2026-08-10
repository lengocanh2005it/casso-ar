import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CopilotPage } from './copilot-page';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  authTokenManager: { getValidAccessToken: vi.fn().mockResolvedValue('t') },
}));
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    user: { role: 'FINANCE_MANAGER', subscriptionPlan: 'STARTER' },
  }),
}));

describe('CopilotPage', () => {
  it('shows a pending action card and confirms it via the pure-code endpoint', async () => {
    apiRequest.mockResolvedValueOnce({
      message: {
        id: 'm1',
        role: 'ASSISTANT',
        content: 'I can send a reminder email for receivable r1.',
        createdAt: '2026-08-03T00:00:00Z',
      },
      pendingAction: {
        id: 'pa1',
        actionType: 'SEND_REMINDER_EMAIL',
        status: 'PENDING',
        payload: { draftId: 'd1', receivableId: 'r1' },
        createdAt: '2026-08-03T00:00:00Z',
        resolvedAt: null,
      },
    });
    apiRequest.mockResolvedValueOnce({ reminderExecutionId: 'ex1' });

    render(<CopilotPage />);

    fireEvent.change(screen.getByLabelText(/enter question/i), {
      target: { value: 'Send reminder email for r1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() =>
      expect(screen.getByText(/confirm reminder email send/i)).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/copilot/actions/pa1/confirm',
          method: 'POST',
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText(/confirm reminder email send/i)).toBeNull(),
    );
  });
});
