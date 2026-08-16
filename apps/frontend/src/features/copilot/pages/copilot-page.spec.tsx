import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CopilotPage } from './copilot-page';

const { apiRequest, mockUseAuth } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  mockUseAuth: vi.fn(() => ({
    user: { role: 'FINANCE_MANAGER', subscriptionPlan: 'STARTER' },
  })),
}));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  authTokenManager: { getValidAccessToken: vi.fn().mockResolvedValue('t') },
}));
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <CopilotPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const USAGE = {
  turnsUsed: 0,
  turnsLimit: 50,
  periodStart: '2026-08-01T00:00:00Z',
  periodEnd: '2026-09-01T00:00:00Z',
};

describe('CopilotPage', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    mockUseAuth.mockReturnValue({
      user: { role: 'FINANCE_MANAGER', subscriptionPlan: 'STARTER' },
    });
  });

  it('shows a pending action card and confirms it via the pure-code endpoint', async () => {
    apiRequest.mockResolvedValueOnce(USAGE).mockResolvedValueOnce({
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

    renderPage();

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

  it('does not permanently lock the chat input for a user without REMINDER_SEND_MANUAL', async () => {
    mockUseAuth.mockReturnValue({
      user: { role: 'SALES_REP', subscriptionPlan: 'STARTER' },
    });
    apiRequest.mockResolvedValueOnce(USAGE).mockResolvedValueOnce({
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

    renderPage();

    fireEvent.change(screen.getByLabelText(/enter question/i), {
      target: { value: 'Send reminder email for r1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/i can send a reminder email/i),
      ).toBeInTheDocument(),
    );
    // No permission to confirm/cancel, so no card — and the input must not be stuck disabled
    expect(
      screen.queryByText(/confirm reminder email send/i),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/enter question/i)).not.toBeDisabled();
  });

  it('switches to the Drafts tab and lists drafts from the API', async () => {
    apiRequest.mockResolvedValueOnce(USAGE).mockResolvedValueOnce({
      items: [
        {
          id: 'draft-1',
          receivableId: 'rec-1',
          recipientEmail: 'ap@abc.vn',
          subject: 'Nhắc thanh toán ABC Company',
          bodyHtml: '<p>...</p>',
          status: 'CANCELLED',
          pendingActionId: null,
          createdAt: '2026-08-14T08:00:00Z',
        },
      ],
      total: 1,
    });

    renderPage();

    fireEvent.mouseDown(screen.getByRole('tab', { name: /drafts/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/nhắc thanh toán abc company/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/nhắc thanh toán abc company/i)).toHaveClass(
      'min-w-0',
      'break-words',
    );
    expect(screen.getByText('ap@abc.vn')).toHaveClass('break-words');
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/v1/copilot/drafts' }),
    );
  });

  it('edits a draft from the Drafts tab', async () => {
    mockUseAuth.mockReturnValue({
      user: { role: 'FINANCE_MANAGER', subscriptionPlan: 'STARTER' },
    });
    apiRequest
      .mockResolvedValueOnce(USAGE)
      .mockResolvedValueOnce({
        items: [
          {
            id: 'draft-1',
            receivableId: 'rec-1',
            recipientEmail: 'ap@abc.vn',
            subject: 'Nhắc thanh toán ABC Company',
            bodyHtml: '<p>...</p>',
            status: 'CANCELLED',
            pendingActionId: null,
            createdAt: '2026-08-14T08:00:00Z',
          },
        ],
        total: 1,
      })
      .mockResolvedValueOnce({
        id: 'draft-1',
        receivableId: 'rec-1',
        recipientEmail: 'ap@abc.vn',
        subject: 'Tiêu đề đã sửa',
        bodyHtml: '<p>...</p>',
        status: 'CANCELLED',
        pendingActionId: null,
        createdAt: '2026-08-14T08:00:00Z',
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'draft-1',
            receivableId: 'rec-1',
            recipientEmail: 'ap@abc.vn',
            subject: 'Tiêu đề đã sửa',
            bodyHtml: '<p>...</p>',
            status: 'CANCELLED',
            pendingActionId: null,
            createdAt: '2026-08-14T08:00:00Z',
          },
        ],
        total: 1,
      });

    renderPage();

    fireEvent.mouseDown(screen.getByRole('tab', { name: /drafts/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/nhắc thanh toán abc company/i),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /sửa|edit/i }));
    expect(screen.getByRole('dialog')).toHaveClass('overscroll-contain');
    const subjectInput = await screen.findByLabelText(/tiêu đề/i);
    expect(subjectInput).toHaveAttribute('name', 'subject');
    expect(subjectInput).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText(/nội dung html/i)).toHaveAttribute(
      'name',
      'bodyHtml',
    );
    fireEvent.change(subjectInput, {
      target: { value: 'Tiêu đề đã sửa' },
    });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/copilot/drafts/draft-1',
          method: 'PATCH',
        }),
      ),
    );
  });

  it('shows inline validation and focuses the missing subject', async () => {
    mockUseAuth.mockReturnValue({
      user: { role: 'FINANCE_MANAGER', subscriptionPlan: 'STARTER' },
    });
    apiRequest.mockResolvedValueOnce(USAGE).mockResolvedValueOnce({
      items: [
        {
          id: 'draft-1',
          receivableId: 'rec-1',
          recipientEmail: 'ap@abc.vn',
          subject: 'Nhắc thanh toán ABC Company',
          bodyHtml: '<p>...</p>',
          status: 'CANCELLED',
          pendingActionId: null,
          createdAt: '2026-08-14T08:00:00Z',
        },
      ],
      total: 1,
    });

    renderPage();

    fireEvent.mouseDown(screen.getByRole('tab', { name: /drafts/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/nhắc thanh toán abc company/i),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /sửa|edit/i }));
    const subjectInput = await screen.findByLabelText(/tiêu đề/i);
    fireEvent.change(subjectInput, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/tiêu đề/i);
    expect(document.activeElement).toBe(subjectInput);
  });

  it('keeps the delete confirmation pending until the request resolves', async () => {
    mockUseAuth.mockReturnValue({
      user: { role: 'FINANCE_MANAGER', subscriptionPlan: 'STARTER' },
    });
    let resolveDelete: (value: { success: boolean }) => void = () => {};
    const deleteResponse = new Promise<{ success: boolean }>((resolve) => {
      resolveDelete = resolve;
    });
    apiRequest
      .mockResolvedValueOnce(USAGE)
      .mockResolvedValueOnce({
        items: [
          {
            id: 'draft-1',
            receivableId: 'rec-1',
            recipientEmail: 'ap@abc.vn',
            subject: 'Nhắc thanh toán ABC Company',
            bodyHtml: '<p>...</p>',
            status: 'CANCELLED',
            pendingActionId: null,
            createdAt: '2026-08-14T08:00:00Z',
          },
        ],
        total: 1,
      })
      .mockReturnValueOnce(deleteResponse)
      .mockResolvedValueOnce({ items: [], total: 0 });

    renderPage();

    fireEvent.mouseDown(screen.getByRole('tab', { name: /drafts/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/nhắc thanh toán abc company/i),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Xóa' }));
    expect(screen.getByRole('alertdialog')).toHaveClass('overscroll-contain');
    fireEvent.click(screen.getByRole('button', { name: /xác nhận/i }));

    expect(screen.getByRole('button', { name: /đang xóa/i })).toBeDisabled();

    resolveDelete({ success: true });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /đang xóa/i })).toBeNull(),
    );
  });
});
