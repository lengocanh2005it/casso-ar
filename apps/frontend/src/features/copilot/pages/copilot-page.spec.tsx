import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
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
  if (/\/api\/v1\/copilot\/conversations\/[^/]+\/messages$/.test(config.url)) {
    return Promise.resolve({ items: [] });
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

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

function renderPage({ withLocationProbe = false } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const page = () => (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <CopilotPage />
        {withLocationProbe && <LocationProbe />}
      </QueryClientProvider>
    </MemoryRouter>
  );
  const view = render(page());

  return {
    ...view,
    queryClient,
    rerenderPage: () => view.rerender(page()),
  };
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

  it('sits on the app canvas with the shared page heading like other pages', async () => {
    renderPage();

    const heading = await screen.findByRole('heading', {
      level: 1,
      name: 'Copilot',
    });
    // An extra padded white panel doubled the shell padding and cost the
    // chat ~50px of width and ~170px of height on phones.
    const workspace = screen.getByRole('region', {
      name: 'Không gian làm việc Copilot',
    });
    expect(workspace.parentElement).not.toHaveClass('p-4');
    expect(workspace.parentElement?.parentElement).not.toHaveClass(
      'bg-background',
    );
    expect(heading).toHaveClass('text-2xl');
  });

  it('shows the welcome state when the conversation has no messages yet', async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/hỏi copilot về công nợ/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
    const composer = screen.getByLabelText(/enter question/i);
    expect(composer).toHaveClass('focus-visible:ring-[3px]');
    expect(composer).not.toHaveClass('focus-visible:ring-0');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the Copilot layout behind an upgrade gate for the FREE plan', async () => {
    mockUseAuth.mockReturnValue({
      user: { role: 'OWNER', subscriptionPlan: 'FREE' },
    });
    renderPage({ withLocationProbe: true });

    await waitFor(() =>
      expect(screen.getByText(/hỏi copilot về công nợ/i)).toBeInTheDocument(),
    );

    await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus());
    expect(
      screen.getByRole('heading', { name: /copilot đang bị khóa/i }),
    ).toBeInTheDocument();
    const copilotContent = document.querySelector('[inert]');
    expect(copilotContent).not.toBeNull();
    expect(copilotContent).toHaveAttribute('inert');
    expect(copilotContent).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(screen.getByRole('button', { name: /nâng cấp gói/i }));

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/settings?tab=billing',
    );
  });

  it('asks users without subscription permission to contact an administrator', async () => {
    mockUseAuth.mockReturnValue({
      user: { role: 'VIEWER', subscriptionPlan: 'FREE' },
    });
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/hỏi copilot về công nợ/i)).toBeInTheDocument(),
    );

    expect(
      screen.getByText(/liên hệ quản trị viên để nâng cấp gói/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /nâng cấp gói/i }),
    ).not.toBeInTheDocument();
  });

  it('closes an open Copilot sheet when the plan loses access', async () => {
    mockUseAuth.mockReturnValue({
      user: { role: 'OWNER', subscriptionPlan: 'STARTER' },
    });
    const { rerenderPage } = renderPage();

    await waitFor(() =>
      expect(screen.getByText(/hỏi copilot về công nợ/i)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /mở lịch sử chat/i }));
    expect(
      screen.getByRole('dialog', { name: /menu điều hướng/i }),
    ).toBeInTheDocument();

    mockUseAuth.mockReturnValue({
      user: { role: 'OWNER', subscriptionPlan: 'FREE' },
    });
    rerenderPage();

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: /menu điều hướng/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it('streams an answer, shows a pending action card, and confirms it', async () => {
    let usageRequests = 0;
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
                receivableLabel: null,
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
      if (config.url === '/api/v1/copilot/usage') {
        return Promise.resolve({ ...USAGE, turnsUsed: usageRequests++ });
      }
      return routeApiRequest(config);
    });
    const { queryClient } = renderPage();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    await waitFor(() =>
      expect(screen.getByText(/hỏi copilot về công nợ/i)).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText(/enter question/i), {
      target: { value: 'Send reminder email for r1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/xác nhận gửi email nhắc thanh toán/i),
      ).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['copilot-usage'],
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/đã dùng 1\/50 lượt copilot/i),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /xác nhận gửi/i }));
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
    expect(screen.getByText('Đang xử lý…')).toBeInTheDocument();
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

  it('locks the input after hitting the Copilot plan quota', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            statusCode: 402,
            errorCode: 'PLAN_LIMIT_EXCEEDED',
            message: 'Đã đạt giới hạn gói FREE; vui lòng nâng cấp để tiếp tục.',
          }),
          { status: 402 },
        ),
      ),
    );
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/hỏi copilot về công nợ/i)).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText(/enter question/i), {
      target: { value: 'Tóm tắt công nợ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() =>
      expect(screen.getByText(/đã đạt giới hạn gói free/i)).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/enter question/i)).toBeDisabled();
  });

  it('allows the chat column to shrink inside the Copilot flex layout', async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/hỏi copilot về công nợ/i)).toBeInTheDocument(),
    );

    expect(
      document.querySelector('.min-w-0.flex-1.flex-col'),
    ).toBeInTheDocument();
  });

  it('keeps the workspace sized to the app canvas after a reply', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          {
            event: 'done',
            data: {
              message: {
                id: 'm1',
                role: 'ASSISTANT',
                content: 'Đây là câu trả lời.',
                createdAt: '2026-08-09T00:00:00Z',
              },
            },
          },
        ]),
      ),
    );
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/hỏi copilot về công nợ/i)).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText(/enter question/i), {
      target: { value: 'Tóm tắt công nợ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() =>
      expect(screen.getByText('Đây là câu trả lời.')).toBeInTheDocument(),
    );

    const workspace = screen.getByRole('region', {
      name: /không gian làm việc copilot/i,
    });
    expect(workspace.parentElement).toHaveClass('h-full');
  });

  it('keeps the Copilot panels inside one shared workspace shell', async () => {
    renderPage();

    const workspace = await screen.findByRole('region', {
      name: /không gian làm việc copilot/i,
    });

    expect(workspace).toHaveClass('overflow-hidden', 'rounded-2xl');
    expect(workspace).not.toHaveClass('shadow-lg', 'bg-card/70');
  });
});
