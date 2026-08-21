import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CopilotPage } from './copilot-page';

const { apiRequest, mockUseAuth } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  mockUseAuth: vi.fn(() => ({
    user: { role: 'FINANCE_MANAGER', subscriptionPlan: 'STARTER' },
  })),
}));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  API_BASE_URL: 'http://localhost:3000',
  authTokenManager: {
    getValidAccessToken: vi.fn().mockResolvedValue('token-1'),
  },
}));
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

const USAGE = {
  turnsUsed: 0,
  turnsLimit: 50,
  periodStart: '2026-08-01T00:00:00Z',
  periodEnd: '2026-09-01T00:00:00Z',
};
const CONVERSATIONS_PAGE = { items: [], total: 0 };
const EMPTY_DRAFTS_PAGE = { items: [], total: 0 };

function routeApiRequest(config: { url: string; method?: string }) {
  if (config.url.endsWith('/usage')) return Promise.resolve(USAGE);
  if (
    config.url === '/api/v1/copilot/conversations' &&
    (config.method ?? 'GET') === 'GET'
  ) {
    return Promise.resolve(CONVERSATIONS_PAGE);
  }
  if (config.url === '/api/v1/copilot/drafts') {
    return Promise.resolve(EMPTY_DRAFTS_PAGE);
  }
  return Promise.reject(
    new Error(
      `Unhandled apiRequest call: ${config.method ?? 'GET'} ${config.url}`,
    ),
  );
}

function sseResponse(events: Array<{ event: string; data: unknown }>) {
  const body = events
    .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join('');
  return new Response(body, { status: 200 });
}

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

describe('CopilotPage', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockImplementation(routeApiRequest);
    mockUseAuth.mockReturnValue({
      user: { role: 'FINANCE_MANAGER', subscriptionPlan: 'STARTER' },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the welcome state when the conversation has no messages yet', async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/hỏi copilot về công nợ/i)).toBeInTheDocument(),
    );
  });

  it('streams an answer, shows a pending action card, and confirms it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          { event: 'delta', data: { text: 'Mình có thể gửi email nhắc.' } },
          {
            event: 'done',
            data: {
              message: {
                id: 'm1',
                role: 'ASSISTANT',
                content: 'Mình có thể gửi email nhắc.',
                createdAt: '2026-08-09T00:00:00Z',
              },
              pendingAction: {
                id: 'pa1',
                actionType: 'SEND_REMINDER_EMAIL',
                status: 'PENDING',
                payload: { draftId: 'd1', receivableId: 'r1' },
                createdAt: '2026-08-09T00:00:00Z',
                resolvedAt: null,
              },
            },
          },
        ]),
      ),
    );
    apiRequest.mockImplementation((config) => {
      if (config.url === '/api/v1/copilot/actions/pa1/confirm') {
        return Promise.resolve({ reminderExecutionId: 'ex1' });
      }
      return routeApiRequest(config);
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/hỏi copilot về công nợ/i)).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText(/enter question/i), {
      target: { value: 'Send reminder email for r1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/confirm reminder email send/i),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({ url: '/api/v1/copilot/actions/pa1/confirm' }),
      ),
    );
  });

  it('shows a Stop button while streaming, which aborts the request', async () => {
    let releaseFetch: () => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            releaseFetch = () => resolve(sseResponse([]));
          }),
      ),
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/hỏi copilot về công nợ/i)).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText(/enter question/i), {
      target: { value: 'Câu hỏi dài' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /dừng/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /dừng/i }));
    releaseFetch();

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /dừng/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it('lists drafts in the side panel alongside the chat, without switching views', async () => {
    apiRequest.mockImplementation((config) => {
      if (config.url === '/api/v1/copilot/drafts') {
        return Promise.resolve({
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
      }
      return routeApiRequest(config);
    });

    renderPage();

    // The chat welcome state and the drafts panel are both visible at once —
    // there is no tab to switch between them any more.
    await waitFor(() =>
      expect(screen.getByText(/hỏi copilot về công nợ/i)).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/nhắc thanh toán abc company/i),
      ).toBeInTheDocument(),
    );
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/v1/copilot/drafts' }),
    );
  });
});
