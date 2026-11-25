import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authTokenManager } from '@/lib/api-client';
import { hoverTooltip } from '@/test/tooltip';
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
      expect(
        screen.getByText(/bạn muốn xử lý công nợ nào/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Gửi' })).toBeDisabled();
    const composer = screen.getByLabelText(/nhập câu hỏi/i);
    expect(composer).toHaveClass('focus-visible:ring-[3px]');
    expect(composer).not.toHaveClass('focus-visible:ring-0');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('announces the wait from a status that exists before the first send', async () => {
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

    // The transcript only mounts once a question exists, so a status living
    // there would arrive with its text already inside and be missed.
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('');

    fireEvent.change(screen.getByLabelText(/nhập câu hỏi/i), {
      target: { value: 'Tóm tắt công nợ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() =>
      expect(status).toHaveTextContent('Copilot đang trả lời…'),
    );
    // Inside the busy log it would be deferred until the first delta.
    expect(
      screen.getByRole('log', { name: 'Cuộc trò chuyện Copilot' }),
    ).not.toContainElement(status);

    releaseFetch();
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Dừng' }),
      ).not.toBeInTheDocument(),
    );
    expect(status).toHaveTextContent('');
  });

  it('stops announcing the wait as soon as the reply fails', async () => {
    // The reader stays open after the error event, exactly like a server that
    // ends the turn without closing the socket.
    let failTurn: () => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                failTurn = () => {
                  controller.enqueue(
                    new TextEncoder().encode(
                      `event: error\ndata: ${JSON.stringify({
                        errorCode: 'INTERNAL_SERVER_ERROR',
                        message: 'Copilot tạm thời không phản hồi.',
                      })}\n\n`,
                    ),
                  );
                };
              },
            }),
            { status: 200 },
          ),
        ),
      ),
    );
    renderPage();
    await screen.findByText(/bạn muốn xử lý công nợ nào/i);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('');

    fireEvent.change(screen.getByLabelText(/nhập câu hỏi/i), {
      target: { value: 'Tóm tắt công nợ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() =>
      expect(status).toHaveTextContent('Copilot đang trả lời…'),
    );

    failTurn();
    // The turn failed, so the wait must not be announced again while the
    // reader is still open.
    await waitFor(() => expect(status).toHaveTextContent(''));
    expect(screen.getByRole('button', { name: 'Dừng' })).toBeInTheDocument();
  });

  it('shows the Copilot layout behind an upgrade gate for the FREE plan', async () => {
    mockUseAuth.mockReturnValue({
      user: { role: 'OWNER', subscriptionPlan: 'FREE' },
    });
    renderPage({ withLocationProbe: true });

    await waitFor(() =>
      expect(
        screen.getByText(/bạn muốn xử lý công nợ nào/i),
      ).toBeInTheDocument(),
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
      expect(
        screen.getByText(/bạn muốn xử lý công nợ nào/i),
      ).toBeInTheDocument(),
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
      expect(
        screen.getByText(/bạn muốn xử lý công nợ nào/i),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /mở lịch sử chat/i }));
    expect(
      screen.getByRole('dialog', { name: 'Lịch sử chat' }),
    ).toBeInTheDocument();

    mockUseAuth.mockReturnValue({
      user: { role: 'OWNER', subscriptionPlan: 'FREE' },
    });
    rerenderPage();

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Lịch sử chat' }),
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
                // Fresh: an old createdAt is expired by the 10-minute TTL.
                createdAt: new Date().toISOString(),
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
      expect(
        screen.getByText(/bạn muốn xử lý công nợ nào/i),
      ).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText(/nhập câu hỏi/i), {
      target: { value: 'Send reminder email for r1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

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
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation((_url: string, init: { signal: AbortSignal }) => {
          requestSignal = init.signal;
          return new Promise((resolve) => {
            releaseFetch = () => resolve(sseResponse([]));
          });
        }),
    );
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByText(/bạn muốn xử lý công nợ nào/i),
      ).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText(/nhập câu hỏi/i), {
      target: { value: 'Câu hỏi dài' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /dừng/i })).toBeInTheDocument(),
    );
    expect(screen.getByText('Copilot đang trả lời…')).toBeInTheDocument();
    expect(
      screen.getByRole('log', { name: 'Cuộc trò chuyện Copilot' }),
    ).toHaveAttribute('aria-busy', 'true');
    expect(requestSignal?.aborted).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /dừng/i }));
    expect(requestSignal?.aborted).toBe(true);
    releaseFetch();

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /dừng/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it('keeps the chat full-width and loads drafts only when their drawer opens', async () => {
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

    await waitFor(() =>
      expect(
        screen.getByText(/bạn muốn xử lý công nợ nào/i),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/nhắc thanh toán abc company/i),
    ).not.toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/v1/copilot/drafts' }),
    );

    fireEvent.click(screen.getByRole('button', { name: /mở bản nháp email/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/nhắc thanh toán abc company/i),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('dialog', { name: 'Bản nháp email' }),
    ).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/v1/copilot/drafts' }),
    );
  });

  it('opens chat history as a named drawer and closes it from its header', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /mở lịch sử chat/i }));

    let drawer = await screen.findByRole('dialog', { name: 'Lịch sử chat' });
    expect(drawer).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(drawer).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /mở lịch sử chat/i }));
    drawer = await screen.findByRole('dialog', { name: 'Lịch sử chat' });
    fireEvent.click(screen.getByRole('button', { name: /đóng lịch sử chat/i }));
    await waitFor(() => expect(drawer).not.toBeInTheDocument());
  });

  it('shows a hover label for the history drawer button', async () => {
    renderPage();
    await screen.findByText(/bạn muốn xử lý công nợ nào/i);

    await expect(
      hoverTooltip(screen.getByRole('button', { name: 'Mở lịch sử chat' })),
    ).resolves.toBe('Mở lịch sử chat');
  });

  it('shows a hover label for the drafts drawer button', async () => {
    renderPage();
    await screen.findByText(/bạn muốn xử lý công nợ nào/i);

    await expect(
      hoverTooltip(screen.getByRole('button', { name: 'Mở bản nháp email' })),
    ).resolves.toBe('Mở bản nháp email');
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
      expect(
        screen.getByText(/bạn muốn xử lý công nợ nào/i),
      ).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText(/nhập câu hỏi/i), {
      target: { value: 'Tóm tắt công nợ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() =>
      expect(screen.getByText(/đã đạt giới hạn gói free/i)).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/nhập câu hỏi/i)).toBeDisabled();
  });

  it('allows the chat column to shrink inside the Copilot flex layout', async () => {
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByText(/bạn muốn xử lý công nợ nào/i),
      ).toBeInTheDocument(),
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
      expect(
        screen.getByText(/bạn muốn xử lý công nợ nào/i),
      ).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText(/nhập câu hỏi/i), {
      target: { value: 'Tóm tắt công nợ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

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

  it('names the composer buttons by their visible Vietnamese text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => new Promise(() => {})),
    );
    renderPage();
    await screen.findByText(/bạn muốn xử lý công nợ nào/i);

    expect(screen.getByRole('button', { name: 'Gửi' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/nhập câu hỏi/i), {
      target: { value: 'Câu hỏi dài' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    const stop = await screen.findByRole('button', { name: 'Dừng' });
    expect(stop).not.toHaveAttribute('aria-label');
    expect(
      screen.queryByRole('button', { name: 'Send' }),
    ).not.toBeInTheDocument();
  });

  it('hides the stop icon from assistive technology', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => new Promise(() => {})),
    );
    renderPage();
    await screen.findByText(/bạn muốn xử lý công nợ nào/i);
    fireEvent.change(screen.getByLabelText(/nhập câu hỏi/i), {
      target: { value: 'Câu hỏi dài' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    const stop = await screen.findByRole('button', { name: 'Dừng' });
    expect(stop.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('restores the question into an empty composer when sending fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    renderPage();
    await screen.findByText(/bạn muốn xử lý công nợ nào/i);

    const composer = screen.getByLabelText(/nhập câu hỏi/i);
    fireEvent.change(composer, { target: { value: 'Tóm tắt công nợ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(composer).toHaveValue('Tóm tắt công nợ'));
  });

  it('shows the failed question once, in the composer and not in the chat', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    renderPage();
    await screen.findByText(/bạn muốn xử lý công nợ nào/i);

    const composer = screen.getByLabelText(/nhập câu hỏi/i);
    fireEvent.change(composer, { target: { value: 'Tóm tắt công nợ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(composer).toHaveValue('Tóm tắt công nợ'));
    // The optimistic bubble goes with the failed request; restoring the draft
    // must not leave the same question rendered twice.
    expect(screen.queryByText('Tóm tắt công nợ', { selector: 'p' })).toBeNull();
  });

  it('keeps a question the server already saved out of the composer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    // The connection dropped before the response headers, but the backend had
    // already persisted the question: the history proves it.
    let messageLoads = 0;
    apiRequest.mockImplementation((config) => {
      if (/\/copilot\/conversations\/[^/]+\/messages$/.test(config.url)) {
        messageLoads += 1;
        if (messageLoads === 1) return Promise.resolve({ items: [] });
        return Promise.resolve({
          items: [
            {
              id: 'u1',
              role: 'USER',
              content: 'Tóm tắt công nợ',
              createdAt: '2026-08-09T00:00:00Z',
            },
          ],
        });
      }
      return routeApiRequest(config);
    });
    renderPage();
    await screen.findByText(/bạn muốn xử lý công nợ nào/i);

    const composer = screen.getByLabelText(/nhập câu hỏi/i);
    fireEvent.change(composer, { target: { value: 'Tóm tắt công nợ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    // Restoring it would offer a resend that duplicates the saved question and
    // bills another turn.
    await screen.findByText('Tóm tắt công nợ', { selector: 'p' });
    expect(composer).toHaveValue('');
  });

  it('does not restore a failed question into the conversation the user switched to', async () => {
    let rejectFetch: (reason: unknown) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            rejectFetch = reject;
          }),
      ),
    );
    apiRequest.mockImplementation((config) => {
      if (config.url === '/api/v1/copilot/conversations') {
        return Promise.resolve({
          items: [
            {
              id: 'c1',
              title: 'Cuộc trò chuyện cũ',
              createdAt: '2026-08-09T00:00:00Z',
              lastMessageAt: '2026-08-09T00:00:00Z',
            },
          ],
          total: 1,
        });
      }
      if (/\/copilot\/conversations\/c1\/messages$/.test(config.url)) {
        return Promise.resolve({ items: [] });
      }
      return routeApiRequest(config);
    });
    renderPage();
    await screen.findByText(/bạn muốn xử lý công nợ nào/i);

    const composer = screen.getByLabelText(/nhập câu hỏi/i);
    fireEvent.change(composer, { target: { value: 'Câu hỏi của cuộc cũ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
    await screen.findByRole('button', { name: 'Dừng' });

    fireEvent.click(screen.getByRole('button', { name: /mở lịch sử chat/i }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cuộc trò chuyện cũ' }),
    );

    await act(async () => {
      rejectFetch(new TypeError('Failed to fetch'));
    });

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Dừng' }),
      ).not.toBeInTheDocument(),
    );
    // The old question belongs to the conversation it was typed in.
    expect(screen.getByLabelText(/nhập câu hỏi/i)).toHaveValue('');
  });

  it('puts a rejected suggestion back into the empty composer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    renderPage();
    await screen.findByText(/bạn muốn xử lý công nợ nào/i);

    const suggestion = 'Khách hàng nào đang có công nợ cao nhất?';
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(suggestion) }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/nhập câu hỏi/i)).toHaveValue(suggestion),
    );
  });

  it('does not drop a rejected suggestion into another conversation', async () => {
    let rejectFetch: (reason: unknown) => void = () => {};
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectFetch = reject;
        }),
    );
    apiRequest.mockImplementation((config) => {
      if (config.url === '/api/v1/copilot/conversations') {
        return Promise.resolve({
          items: [
            {
              id: 'c1',
              title: 'Cuộc trò chuyện cũ',
              createdAt: '2026-08-09T00:00:00Z',
              lastMessageAt: '2026-08-09T00:00:00Z',
            },
          ],
          total: 1,
        });
      }
      if (/\/copilot\/conversations\/c1\/messages$/.test(config.url)) {
        return Promise.resolve({ items: [] });
      }
      return routeApiRequest(config);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await screen.findByText(/bạn muốn xử lý công nợ nào/i);

    fireEvent.click(
      screen.getByRole('button', {
        name: /khách hàng nào đang có công nợ cao nhất/i,
      }),
    );
    await screen.findByRole('button', { name: 'Dừng' });

    fireEvent.click(screen.getByRole('button', { name: /mở lịch sử chat/i }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cuộc trò chuyện cũ' }),
    );

    await act(async () => {
      rejectFetch(new TypeError('Failed to fetch'));
    });

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Dừng' }),
      ).not.toBeInTheDocument(),
    );
    // The suggestion belongs to the conversation it was clicked in.
    expect(screen.getByLabelText(/nhập câu hỏi/i)).toHaveValue('');
  });

  it('hands the question back when Stop lands before the POST is dispatched', async () => {
    // The token lookup still runs before the POST: stopping during it must
    // leave the question unsent and put it back in the composer.
    // A real fetch rejects an already-aborted request before it leaves the
    // browser; this mock mirrors that so "posted" means "hit the network".
    let posted = false;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation((_url: string, init: { signal: AbortSignal }) => {
          if (init.signal.aborted) {
            return Promise.reject(new DOMException('aborted', 'AbortError'));
          }
          posted = true;
          return Promise.reject(new TypeError('Failed to fetch'));
        }),
    );
    let releaseToken: (token: string) => void = () => {};
    vi.mocked(authTokenManager.getValidAccessToken).mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          releaseToken = resolve;
        }),
    );
    renderPage();
    await screen.findByText(/bạn muốn xử lý công nợ nào/i);

    const composer = screen.getByLabelText(/nhập câu hỏi/i);
    fireEvent.change(composer, { target: { value: 'Tóm tắt công nợ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Dừng' }));
    releaseToken('token-1');

    await waitFor(() => expect(composer).toHaveValue('Tóm tắt công nợ'));
    // The request never reached the server, so the turn was not counted.
    expect(posted).toBe(false);
    expect(
      screen.queryByText('Tóm tắt công nợ', { selector: 'p' }),
    ).not.toBeInTheDocument();
  });

  it('hands the question back when Stop lands after the POST but before its headers', async () => {
    // Real fetch rejects with AbortError when the signal fires; the never-
    // settling promise has to honour the signal or send() would never finish.
    let dispatched = false;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            dispatched = true;
            init.signal.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      ),
    );
    renderPage();
    await screen.findByText(/bạn muốn xử lý công nợ nào/i);

    const composer = screen.getByLabelText(/nhập câu hỏi/i);
    fireEvent.change(composer, { target: { value: 'Tóm tắt công nợ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Dừng' }));
    expect(dispatched).toBe(true);

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Dừng' }),
      ).not.toBeInTheDocument(),
    );
    // The history does not hold the question, so the server never took the
    // turn: it comes back for a retry and the bubble is gone.
    await waitFor(() => expect(composer).toHaveValue('Tóm tắt công nợ'));
    expect(screen.queryByText('Tóm tắt công nợ')).not.toBeInTheDocument();
  });

  it('keeps the composer empty and the streamed answer when the stream breaks after acceptance', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  `event: delta\ndata: ${JSON.stringify({ text: 'Đang phân tích' })}\n\n`,
                ),
              );
            },
            // Pull-based so the delta is delivered before the socket dies.
            pull(controller) {
              controller.error(new TypeError('stream cut'));
            },
          }),
          { status: 200 },
        ),
      ),
    );
    renderPage();
    await screen.findByText(/bạn muốn xử lý công nợ nào/i);

    const composer = screen.getByLabelText(/nhập câu hỏi/i);
    fireEvent.change(composer, { target: { value: 'Tóm tắt công nợ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    // The backend already counted this turn, so the question must not be
    // handed back for a duplicate send; the streamed text stays on screen.
    await screen.findByText('Đang phân tích');
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Dừng' }),
      ).not.toBeInTheDocument(),
    );
    // The streamed text survives the broken tail and nothing comes back.
    expect(screen.getByText('Đang phân tích')).toBeInTheDocument();
    expect(composer).toHaveValue('');
  });

  it('does not overwrite text typed while the failed send was in flight', async () => {
    let rejectFetch: (reason: unknown) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            rejectFetch = reject;
          }),
      ),
    );
    renderPage();
    await screen.findByText(/bạn muốn xử lý công nợ nào/i);

    const composer = screen.getByLabelText(/nhập câu hỏi/i);
    fireEvent.change(composer, { target: { value: 'Tóm tắt công nợ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await screen.findByRole('button', { name: 'Dừng' });
    fireEvent.change(composer, { target: { value: 'Câu hỏi mới' } });
    rejectFetch(new TypeError('Failed to fetch'));

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Dừng' }),
      ).not.toBeInTheDocument(),
    );
    expect(composer).toHaveValue('Câu hỏi mới');
  });

  it('keeps the composer empty when the server accepted the question', async () => {
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
    await screen.findByText(/bạn muốn xử lý công nợ nào/i);

    const composer = screen.getByLabelText(/nhập câu hỏi/i);
    fireEvent.change(composer, { target: { value: 'Tóm tắt công nợ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await screen.findByText('Đây là câu trả lời.');
    expect(composer).toHaveValue('');
  });

  it('keeps the composer usable while a reply is streaming', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => new Promise(() => {})),
    );
    renderPage();
    await screen.findByText(/bạn muốn xử lý công nợ nào/i);

    const composer = screen.getByLabelText(/nhập câu hỏi/i);
    fireEvent.change(composer, { target: { value: 'Câu hỏi dài' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await screen.findByRole('button', { name: 'Dừng' });
    expect(composer).not.toBeDisabled();
  });

  it('returns focus to the composer after a turn finishes', async () => {
    let releaseFetch: () => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            releaseFetch = () =>
              resolve(
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
                      pendingAction: null,
                    },
                  },
                ]),
              );
          }),
      ),
    );
    renderPage();
    await screen.findByText(/bạn muốn xử lý công nợ nào/i);

    const composer = screen.getByLabelText(/nhập câu hỏi/i);
    fireEvent.change(composer, { target: { value: 'Tóm tắt công nợ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    // The reader parked focus on the Stop button; when it unmounts the
    // browser drops focus to <body>, which is when focus must come back.
    const stopButton = await screen.findByRole('button', { name: 'Dừng' });
    stopButton.focus();
    expect(stopButton).toHaveFocus();
    releaseFetch();

    await screen.findByText('Đây là câu trả lời.');
    await waitFor(() => expect(composer).toHaveFocus());
  });

  it('does not pull focus back to the composer on a coarse pointer', async () => {
    let releaseFetch: () => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            releaseFetch = () =>
              resolve(
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
                      pendingAction: null,
                    },
                  },
                ]),
              );
          }),
      ),
    );
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
      })),
    );
    renderPage();
    await screen.findByText(/bạn muốn xử lý công nợ nào/i);

    const composer = screen.getByLabelText(/nhập câu hỏi/i);
    fireEvent.change(composer, { target: { value: 'Tóm tắt công nợ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    // Same turn as the fine-pointer case; only the pointer type differs.
    const stopButton = await screen.findByRole('button', { name: 'Dừng' });
    stopButton.focus();
    expect(stopButton).toHaveFocus();
    releaseFetch();

    await screen.findByText('Đây là câu trả lời.');
    // A touch keyboard would pop up if focus jumped back on a phone.
    expect(composer).not.toHaveFocus();
  });

  it('shows the pending-action placeholder while a proposal needs an answer', async () => {
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
                content: 'Mình có thể gửi email nhắc.',
                createdAt: new Date().toISOString(),
              },
              pendingAction: {
                id: 'pa1',
                actionType: 'SEND_REMINDER_EMAIL',
                status: 'PENDING',
                payload: { draftId: 'd1', receivableId: 'r1' },
                receivableLabel: null,
                createdAt: new Date().toISOString(),
                resolvedAt: null,
              },
            },
          },
        ]),
      ),
    );
    renderPage();
    await screen.findByText(/bạn muốn xử lý công nợ nào/i);

    const composer = screen.getByLabelText(/nhập câu hỏi/i);
    expect(composer).toHaveAttribute('placeholder', 'Hỏi về công nợ…');

    fireEvent.change(composer, { target: { value: 'Soạn email nhắc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() =>
      expect(composer).toHaveAttribute(
        'placeholder',
        'Xác nhận hoặc hủy đề xuất gửi email để tiếp tục…',
      ),
    );
    expect(composer).toBeDisabled();
  });

  describe('auto-scroll', () => {
    const geometry = { distanceFromBottom: 0 };
    // jsdom's own property descriptors are what the rest of the suite expects
    // back, so restore them rather than deleting the stubs.
    let savedDescriptors = new Map<string, PropertyDescriptor | undefined>();

    function ownDescriptor(key: string) {
      let target: object | null = Element.prototype;
      while (target) {
        const descriptor = Object.getOwnPropertyDescriptor(target, key);
        if (descriptor) return descriptor;
        target = Object.getPrototypeOf(target) as object | null;
      }
      return undefined;
    }

    function stubScrollGeometry({
      distanceFromBottom,
    }: {
      distanceFromBottom: number;
    }) {
      const scrollTo = vi.fn();
      geometry.distanceFromBottom = distanceFromBottom;
      for (const key of [
        'scrollHeight',
        'clientHeight',
        'scrollTop',
        'scrollTo',
      ]) {
        savedDescriptors.set(key, ownDescriptor(key));
      }
      Object.defineProperty(Element.prototype, 'scrollHeight', {
        configurable: true,
        get: () => 1000,
      });
      Object.defineProperty(Element.prototype, 'clientHeight', {
        configurable: true,
        get: () => 400,
      });
      Object.defineProperty(Element.prototype, 'scrollTop', {
        configurable: true,
        get() {
          return 600 - geometry.distanceFromBottom;
        },
        set: () => {},
      });
      Object.defineProperty(Element.prototype, 'scrollTo', {
        configurable: true,
        writable: true,
        value: scrollTo,
      });
      return scrollTo;
    }

    afterEach(() => {
      Reflect.deleteProperty(window, 'onscrollend');
      for (const [key, descriptor] of savedDescriptors) {
        if (descriptor) {
          Object.defineProperty(Element.prototype, key, descriptor);
        } else {
          Reflect.deleteProperty(Element.prototype, key);
        }
      }
      savedDescriptors = new Map();
    });

    it('scrolls to the bottom when a new message arrives while near the bottom', async () => {
      let releaseFetch: () => void = () => {};
      const scrollTo = stubScrollGeometry({ distanceFromBottom: 10 });
      renderPage();
      await screen.findByText(/bạn muốn xử lý công nợ nào/i);

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              releaseFetch = () =>
                resolve(
                  sseResponse([
                    {
                      event: 'delta',
                      data: { text: 'Đang soạn câu trả lời.' },
                    },
                    {
                      event: 'done',
                      data: {
                        message: {
                          id: 'm1',
                          role: 'ASSISTANT',
                          content: 'Đang soạn câu trả lời.',
                          createdAt: '2026-08-09T00:00:00Z',
                        },
                        pendingAction: null,
                      },
                    },
                  ]),
                );
            }),
        ),
      );
      fireEvent.change(screen.getByLabelText(/nhập câu hỏi/i), {
        target: { value: 'Tóm tắt công nợ' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
      await screen.findByRole('button', { name: 'Dừng' });
      // Send scrolls once; only the new message's own scroll is under test.
      scrollTo.mockClear();
      releaseFetch();

      await screen.findByText('Đang soạn câu trả lời.');
      expect(scrollTo).toHaveBeenCalled();
    });

    it('scrolls while streaming text keeps growing', async () => {
      const scrollTo = stubScrollGeometry({ distanceFromBottom: 0 });
      renderPage();
      await screen.findByText(/bạn muốn xử lý công nợ nào/i);

      let pushEvent: (event: unknown) => void = () => {};
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            new ReadableStream({
              start(controller) {
                pushEvent = (event) => {
                  const typed = event as { event: string; data: unknown };
                  controller.enqueue(
                    new TextEncoder().encode(
                      `event: ${typed.event}\ndata: ${JSON.stringify(typed.data)}\n\n`,
                    ),
                  );
                };
              },
            }),
            { status: 200 },
          ),
        ),
      );
      fireEvent.change(screen.getByLabelText(/nhập câu hỏi/i), {
        target: { value: 'Tóm tắt công nợ' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

      await screen.findByRole('button', { name: 'Dừng' });
      const callsBefore = scrollTo.mock.calls.length;
      await act(async () => {
        pushEvent({ event: 'delta', data: { text: 'Một đoạn ' } });
      });
      await act(async () => {
        pushEvent({ event: 'delta', data: { text: 'nữa.' } });
      });

      expect(scrollTo.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    it('scrolls instantly when the user prefers reduced motion', async () => {
      const scrollTo = stubScrollGeometry({ distanceFromBottom: 10 });
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockImplementation((query: string) => ({
          matches: true,
          media: query,
        })),
      );
      renderPage();
      await screen.findByText(/bạn muốn xử lý công nợ nào/i);

      let releaseFetch: () => void = () => {};
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              releaseFetch = () =>
                resolve(
                  sseResponse([
                    {
                      event: 'done',
                      data: {
                        message: {
                          id: 'm1',
                          role: 'ASSISTANT',
                          content: 'Đang soạn câu trả lời.',
                          createdAt: '2026-08-09T00:00:00Z',
                        },
                        pendingAction: null,
                      },
                    },
                  ]),
                );
            }),
        ),
      );
      fireEvent.change(screen.getByLabelText(/nhập câu hỏi/i), {
        target: { value: 'Tóm tắt công nợ' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
      await screen.findByRole('button', { name: 'Dừng' });
      // Clear the mount and send scrolls so only the reply's is asserted.
      scrollTo.mockClear();
      releaseFetch();

      await screen.findByText('Đang soạn câu trả lời.');
      expect(scrollTo).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: 'auto' }),
      );
    });

    it('follows a question the user sends even after scrolling up', async () => {
      const scrollTo = stubScrollGeometry({ distanceFromBottom: 10 });
      renderPage();
      await screen.findByText(/bạn muốn xử lý công nợ nào/i);

      const region = document.querySelector('[data-testid="copilot-scroll"]');
      if (!(region instanceof HTMLElement)) throw new Error('missing region');
      geometry.distanceFromBottom = 400;
      fireEvent.scroll(region);
      scrollTo.mockClear();

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(() => new Promise(() => {})),
      );
      fireEvent.change(screen.getByLabelText(/nhập câu hỏi/i), {
        target: { value: 'Tóm tắt công nợ' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
      await screen.findByRole('button', { name: 'Dừng' });

      // Sending is an explicit intent to see the answer, unlike an incoming token.
      expect(scrollTo).toHaveBeenCalled();
      const lastCall = scrollTo.mock.calls.at(-1)?.[0] as
        | ScrollToOptions
        | undefined;
      expect(lastCall?.top).toBe(1000);
    });

    it('opens a switched-to conversation at the bottom again', async () => {
      apiRequest.mockImplementation((config) => {
        if (config.url === '/api/v1/copilot/conversations') {
          return Promise.resolve({
            items: [
              {
                id: 'c1',
                title: 'Cuộc trò chuyện cũ',
                createdAt: '2026-08-09T00:00:00Z',
                lastMessageAt: '2026-08-09T00:00:00Z',
              },
            ],
            total: 1,
          });
        }
        if (/\/copilot\/conversations\/c1\/messages$/.test(config.url)) {
          return Promise.resolve({
            items: [
              {
                id: 'h1',
                role: 'USER',
                content: 'Câu hỏi cũ',
                createdAt: '2026-08-09T00:00:00Z',
              },
            ],
          });
        }
        return routeApiRequest(config);
      });
      const scrollTo = stubScrollGeometry({ distanceFromBottom: 10 });
      renderPage();
      await screen.findByText(/bạn muốn xử lý công nợ nào/i);

      const region = document.querySelector('[data-testid="copilot-scroll"]');
      if (!(region instanceof HTMLElement)) throw new Error('missing region');
      geometry.distanceFromBottom = 400;
      fireEvent.scroll(region);
      // Only the switched-to conversation's own scroll is under test.
      scrollTo.mockClear();

      fireEvent.click(screen.getByRole('button', { name: /mở lịch sử chat/i }));
      fireEvent.click(
        await screen.findByRole('button', { name: 'Cuộc trò chuyện cũ' }),
      );

      await screen.findByText('Câu hỏi cũ');
      await waitFor(() => expect(scrollTo).toHaveBeenCalled());
      const lastCall = scrollTo.mock.calls.at(-1)?.[0] as
        | ScrollToOptions
        | undefined;
      expect(lastCall?.top).toBe(1000);
    });

    it('does not scroll on a streaming delta while the user is far from the bottom', async () => {
      const scrollTo = stubScrollGeometry({ distanceFromBottom: 10 });
      renderPage();
      await screen.findByText(/bạn muốn xử lý công nợ nào/i);

      let pushEvent: (event: unknown) => void = () => {};
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            new ReadableStream({
              start(controller) {
                pushEvent = (event) => {
                  const typed = event as { event: string; data: unknown };
                  controller.enqueue(
                    new TextEncoder().encode(
                      `event: ${typed.event}\ndata: ${JSON.stringify(typed.data)}\n\n`,
                    ),
                  );
                };
              },
            }),
            { status: 200 },
          ),
        ),
      );
      fireEvent.change(screen.getByLabelText(/nhập câu hỏi/i), {
        target: { value: 'Tóm tắt công nợ' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
      await screen.findByRole('button', { name: 'Dừng' });

      const region = document.querySelector('[data-testid="copilot-scroll"]');
      if (!(region instanceof HTMLElement)) throw new Error('missing region');
      geometry.distanceFromBottom = 400;
      fireEvent.scroll(region);
      scrollTo.mockClear();

      await act(async () => {
        pushEvent({ event: 'delta', data: { text: 'Một đoạn ' } });
      });
      await act(async () => {
        pushEvent({ event: 'delta', data: { text: 'nữa.' } });
      });

      expect(scrollTo).not.toHaveBeenCalled();
    });

    it('rechecks real scroll position before following a late delta', async () => {
      const scrollTo = stubScrollGeometry({ distanceFromBottom: 10 });
      renderPage();
      await screen.findByText(/bạn muốn xử lý công nợ nào/i);

      let pushEvent: (event: unknown) => void = () => {};
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            new ReadableStream({
              start(controller) {
                pushEvent = (event) => {
                  const typed = event as { event: string; data: unknown };
                  controller.enqueue(
                    new TextEncoder().encode(
                      `event: ${typed.event}\ndata: ${JSON.stringify(typed.data)}\n\n`,
                    ),
                  );
                };
              },
            }),
            { status: 200 },
          ),
        ),
      );
      fireEvent.change(screen.getByLabelText(/nhập câu hỏi/i), {
        target: { value: 'Tóm tắt công nợ' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
      await screen.findByRole('button', { name: 'Dừng' });

      // The reader scrolls up, but the browser's scroll event has not reached
      // React's onScroll handler yet when the next token arrives.
      geometry.distanceFromBottom = 400;
      scrollTo.mockClear();

      await act(async () => {
        pushEvent({ event: 'delta', data: { text: 'Một đoạn ' } });
      });

      expect(scrollTo).not.toHaveBeenCalled();
    });

    it('opens a loaded history instantly so the animation cannot flip the stick flag', async () => {
      apiRequest.mockImplementation((config) => {
        if (config.url === '/api/v1/copilot/conversations') {
          return Promise.resolve({
            items: [
              {
                id: 'c1',
                title: 'Cuộc trò chuyện cũ',
                createdAt: '2026-08-09T00:00:00Z',
                lastMessageAt: '2026-08-09T00:00:00Z',
              },
            ],
            total: 1,
          });
        }
        if (/\/copilot\/conversations\/c1\/messages$/.test(config.url)) {
          return Promise.resolve({
            items: [
              {
                id: 'h1',
                role: 'USER',
                content: 'Câu hỏi cũ',
                createdAt: '2026-08-09T00:00:00Z',
              },
              {
                id: 'h2',
                role: 'ASSISTANT',
                content: 'Câu trả lời cũ',
                createdAt: '2026-08-09T00:00:01Z',
              },
            ],
          });
        }
        return routeApiRequest(config);
      });
      const scrollTo = stubScrollGeometry({ distanceFromBottom: 10 });
      renderPage();
      await screen.findByText(/bạn muốn xử lý công nợ nào/i);

      fireEvent.click(screen.getByRole('button', { name: /mở lịch sử chat/i }));
      fireEvent.click(
        await screen.findByRole('button', { name: 'Cuộc trò chuyện cũ' }),
      );

      await screen.findByText('Câu trả lời cũ');
      await waitFor(() => expect(scrollTo).toHaveBeenCalled());
      // A bulk history jump must not animate: its own scroll events would
      // otherwise arrive mid-animation and clear the stick flag.
      expect(scrollTo).toHaveBeenLastCalledWith(
        expect.objectContaining({ behavior: 'auto' }),
      );
    });

    it('re-reads the real distance when the programmatic scroll settles', async () => {
      const scrollTo = stubScrollGeometry({ distanceFromBottom: 10 });
      renderPage();
      await screen.findByText(/bạn muốn xử lý công nợ nào/i);

      let pushEvent: (event: unknown) => void = () => {};
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            new ReadableStream({
              start(controller) {
                pushEvent = (event) => {
                  const typed = event as { event: string; data: unknown };
                  controller.enqueue(
                    new TextEncoder().encode(
                      `event: ${typed.event}\ndata: ${JSON.stringify(typed.data)}\n\n`,
                    ),
                  );
                };
              },
            }),
            { status: 200 },
          ),
        ),
      );
      fireEvent.change(screen.getByLabelText(/nhập câu hỏi/i), {
        target: { value: 'Tóm tắt công nợ' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
      await screen.findByRole('button', { name: 'Dừng' });

      // The assistant message arriving on its own animates smoothly.
      await act(async () => {
        pushEvent({
          event: 'done',
          data: {
            message: {
              id: 'm1',
              role: 'ASSISTANT',
              content: 'Đây là câu trả lời.',
              createdAt: '2026-08-09T00:00:00Z',
            },
            pendingAction: null,
          },
        });
      });
      await screen.findByText('Đây là câu trả lời.');

      const region = document.querySelector('[data-testid="copilot-scroll"]');
      if (!(region instanceof HTMLElement)) throw new Error('missing region');
      // The animation passes through a position below the bottom; its own
      // scroll event looks like the page's, so it is ignored.
      geometry.distanceFromBottom = -300;
      fireEvent.scroll(region);
      // It settles 300px short of the bottom: the reader is reading history.
      geometry.distanceFromBottom = 300;
      fireEvent(region, new Event('scrollend'));
      scrollTo.mockClear();

      await act(async () => {
        pushEvent({ event: 'delta', data: { text: 'Một đoạn ' } });
      });

      // Settled away from the bottom: this reader must not be yanked down.
      expect(scrollTo).not.toHaveBeenCalled();
    });

    it('stops swallowing scrolls when the browser has no scrollend', async () => {
      // jsdom ships onscrollend; delete it to model an older browser.
      Reflect.deleteProperty(window, 'onscrollend');
      const scrollTo = stubScrollGeometry({ distanceFromBottom: 10 });
      renderPage();
      await screen.findByText(/bạn muốn xử lý công nợ nào/i);

      let pushEvent: (event: unknown) => void = () => {};
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            new ReadableStream({
              start(controller) {
                pushEvent = (event) => {
                  const typed = event as { event: string; data: unknown };
                  controller.enqueue(
                    new TextEncoder().encode(
                      `event: ${typed.event}\ndata: ${JSON.stringify(typed.data)}\n\n`,
                    ),
                  );
                };
              },
            }),
            { status: 200 },
          ),
        ),
      );
      fireEvent.change(screen.getByLabelText(/nhập câu hỏi/i), {
        target: { value: 'Tóm tắt công nợ' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
      await screen.findByRole('button', { name: 'Dừng' });
      await act(async () => {
        pushEvent({
          event: 'done',
          data: {
            message: {
              id: 'm1',
              role: 'ASSISTANT',
              content: 'Đây là câu trả lời.',
              createdAt: '2026-08-09T00:00:00Z',
            },
            pendingAction: null,
          },
        });
      });
      await screen.findByText('Đây là câu trả lời.');

      // The browser drops scrollend (or never moved the list) and the reader
      // ends up far from the bottom without any event telling us.
      geometry.distanceFromBottom = 300;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });
      scrollTo.mockClear();

      await act(async () => {
        pushEvent({ event: 'delta', data: { text: 'Một đoạn ' } });
      });

      // The fallback re-read the position, so this reader is left alone.
      expect(scrollTo).not.toHaveBeenCalled();
    });

    it('leaves a supported scrollend to settle the scroll, not a fixed timer', async () => {
      // A real smooth scroll can run longer than any fixed timeout. Chrome
      // fires scrollend, so the timer must not cut the animation short.
      Object.defineProperty(window, 'onscrollend', {
        configurable: true,
        value: null,
      });
      try {
        const scrollTo = stubScrollGeometry({ distanceFromBottom: 10 });
        renderPage();
        await screen.findByText(/bạn muốn xử lý công nợ nào/i);

        let pushEvent: (event: unknown) => void = () => {};
        vi.stubGlobal(
          'fetch',
          vi.fn().mockResolvedValue(
            new Response(
              new ReadableStream({
                start(controller) {
                  pushEvent = (event) => {
                    const typed = event as { event: string; data: unknown };
                    controller.enqueue(
                      new TextEncoder().encode(
                        `event: ${typed.event}\ndata: ${JSON.stringify(typed.data)}\n\n`,
                      ),
                    );
                  };
                },
              }),
              { status: 200 },
            ),
          ),
        );
        fireEvent.change(screen.getByLabelText(/nhập câu hỏi/i), {
          target: { value: 'Tóm tắt công nợ' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
        await screen.findByRole('button', { name: 'Dừng' });
        await act(async () => {
          pushEvent({
            event: 'done',
            data: {
              message: {
                id: 'm1',
                role: 'ASSISTANT',
                content: 'Đây là câu trả lời.',
                createdAt: '2026-08-09T00:00:00Z',
              },
              pendingAction: null,
            },
          });
        });
        await screen.findByText('Đây là câu trả lời.');

        // The animation is still running past any fixed timeout.
        geometry.distanceFromBottom = 300;
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 250));
        });
        scrollTo.mockClear();

        await act(async () => {
          pushEvent({ event: 'delta', data: { text: 'Một đoạn ' } });
        });

        // Still latched: the reader who was at the bottom keeps following.
        expect(scrollTo).toHaveBeenCalled();
      } finally {
        Reflect.deleteProperty(window, 'onscrollend');
      }
    });

    it('opens a single-message history instantly too', async () => {
      apiRequest.mockImplementation((config) => {
        if (config.url === '/api/v1/copilot/conversations') {
          return Promise.resolve({
            items: [
              {
                id: 'c1',
                title: 'Cuộc trò chuyện cũ',
                createdAt: '2026-08-09T00:00:00Z',
                lastMessageAt: '2026-08-09T00:00:00Z',
              },
            ],
            total: 1,
          });
        }
        if (/\/copilot\/conversations\/c1\/messages$/.test(config.url)) {
          return Promise.resolve({
            items: [
              {
                id: 'h1',
                role: 'ASSISTANT',
                content: 'Câu trả lời cũ',
                createdAt: '2026-08-09T00:00:00Z',
              },
            ],
          });
        }
        return routeApiRequest(config);
      });
      const scrollTo = stubScrollGeometry({ distanceFromBottom: 10 });
      renderPage();
      await screen.findByText(/bạn muốn xử lý công nợ nào/i);

      fireEvent.click(screen.getByRole('button', { name: /mở lịch sử chat/i }));
      fireEvent.click(
        await screen.findByRole('button', { name: 'Cuộc trò chuyện cũ' }),
      );

      await screen.findByText('Câu trả lời cũ');
      await waitFor(() => expect(scrollTo).toHaveBeenCalled());
      // One row is still a history jump, not a message arriving mid-chat.
      expect(scrollTo).toHaveBeenLastCalledWith(
        expect.objectContaining({ behavior: 'auto' }),
      );
    });

    it('ignores the scroll events its own scrollTo fires, then honours a real one', async () => {
      // Start far from the bottom so the send's smooth scroll has room to run.
      const scrollTo = stubScrollGeometry({ distanceFromBottom: 600 });
      renderPage();
      await screen.findByText(/bạn muốn xử lý công nợ nào/i);

      const region = document.querySelector('[data-testid="copilot-scroll"]');
      if (!(region instanceof HTMLElement)) throw new Error('missing region');
      // The initial render scrolled the list programmatically.
      await waitFor(() => expect(scrollTo).toHaveBeenCalled());

      let pushEvent: (event: unknown) => void = () => {};
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            new ReadableStream({
              start(controller) {
                pushEvent = (event) => {
                  const typed = event as { event: string; data: unknown };
                  controller.enqueue(
                    new TextEncoder().encode(
                      `event: ${typed.event}\ndata: ${JSON.stringify(typed.data)}\n\n`,
                    ),
                  );
                };
              },
            }),
            { status: 200 },
          ),
        ),
      );
      // Send first: its own smooth scroll must already be under way before the
      // animation's scroll events are simulated, or the spy would conflate them.
      fireEvent.change(screen.getByLabelText(/nhập câu hỏi/i), {
        target: { value: 'Tóm tắt công nợ' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
      await screen.findByRole('button', { name: 'Dừng' });
      // The answer arriving on its own animates, which opens the window in
      // which the page's own scroll events must not be read as the reader's.
      await act(async () => {
        pushEvent({
          event: 'done',
          data: {
            message: {
              id: 'm1',
              role: 'ASSISTANT',
              content: 'Đây là câu trả lời.',
              createdAt: '2026-08-09T00:00:00Z',
            },
            pendingAction: null,
          },
        });
      });
      await screen.findByText('Đây là câu trả lời.');
      expect(scrollTo).toHaveBeenLastCalledWith(
        expect.objectContaining({ behavior: 'smooth' }),
      );
      scrollTo.mockClear();

      // A smooth animation reports positions far from the bottom on its way
      // down; those events are the page's own, not the reader scrolling up.
      geometry.distanceFromBottom = 300;
      fireEvent.scroll(region);
      // The animation then lands on the newest message.
      geometry.distanceFromBottom = 0;
      fireEvent(region, new Event('scrollend'));
      scrollTo.mockClear();

      // Still stuck to the bottom, so a delta scrolls into view.
      await act(async () => {
        pushEvent({ event: 'delta', data: { text: 'Một đoạn ' } });
      });
      expect(scrollTo).toHaveBeenCalled();
      // The optimistic message's smooth scroll is over.
      fireEvent(region, new Event('scrollend'));

      // Now a genuine scroll up: the flag must flip again.
      geometry.distanceFromBottom = 400;
      fireEvent.scroll(region);
      scrollTo.mockClear();

      await act(async () => {
        pushEvent({ event: 'delta', data: { text: 'nữa.' } });
      });
      expect(scrollTo).not.toHaveBeenCalled();
    });

    it('stops following when the reader reverses direction inside a smooth scroll', async () => {
      const scrollTo = stubScrollGeometry({ distanceFromBottom: 600 });
      renderPage();
      await screen.findByText(/bạn muốn xử lý công nợ nào/i);

      let pushEvent: (event: unknown) => void = () => {};
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            new ReadableStream({
              start(controller) {
                pushEvent = (event) => {
                  const typed = event as { event: string; data: unknown };
                  controller.enqueue(
                    new TextEncoder().encode(
                      `event: ${typed.event}
data: ${JSON.stringify(typed.data)}\n\n`,
                    ),
                  );
                };
              },
            }),
            { status: 200 },
          ),
        ),
      );
      const region = document.querySelector('[data-testid="copilot-scroll"]');
      if (!(region instanceof HTMLElement)) throw new Error('missing region');

      fireEvent.change(screen.getByLabelText(/nhập câu hỏi/i), {
        target: { value: 'Tóm tắt công nợ' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
      await screen.findByRole('button', { name: 'Dừng' });

      // A single appended answer animates smoothly: it starts at scrollTop 0
      // and travels down to 300.
      await act(async () => {
        pushEvent({
          event: 'done',
          data: {
            message: {
              id: 'm1',
              role: 'ASSISTANT',
              content: 'Đây là câu trả lời.',
              createdAt: '2026-08-09T00:00:00Z',
            },
            pendingAction: null,
          },
        });
      });
      await screen.findByText('Đây là câu trả lời.');
      expect(scrollTo).toHaveBeenLastCalledWith(
        expect.objectContaining({ behavior: 'smooth' }),
      );

      // The animation reaches scrollTop 300: still downward, still ignored.
      geometry.distanceFromBottom = 300;
      fireEvent.scroll(region);

      // The reader then pulls back up mid-animation, from 300 to 150. Measured
      // against the position the animation started from that is still
      // "downward" and would be swallowed; it is a reversal, so stop following.
      geometry.distanceFromBottom = 450;
      fireEvent.scroll(region);
      scrollTo.mockClear();
      await act(async () => {
        pushEvent({ event: 'delta', data: { text: 'Một đoạn ' } });
      });

      expect(scrollTo).not.toHaveBeenCalled();
    });

    it('scrolls streaming deltas instantly so the smooth animation cannot flip the stick flag', async () => {
      const scrollTo = stubScrollGeometry({ distanceFromBottom: 0 });
      renderPage();
      await screen.findByText(/bạn muốn xử lý công nợ nào/i);

      let pushEvent: (event: unknown) => void = () => {};
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            new ReadableStream({
              start(controller) {
                pushEvent = (event) => {
                  const typed = event as { event: string; data: unknown };
                  controller.enqueue(
                    new TextEncoder().encode(
                      `event: ${typed.event}\ndata: ${JSON.stringify(typed.data)}\n\n`,
                    ),
                  );
                };
              },
            }),
            { status: 200 },
          ),
        ),
      );
      fireEvent.change(screen.getByLabelText(/nhập câu hỏi/i), {
        target: { value: 'Tóm tắt công nợ' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
      await screen.findByRole('button', { name: 'Dừng' });
      scrollTo.mockClear();

      await act(async () => {
        pushEvent({ event: 'delta', data: { text: 'Một đoạn ' } });
      });

      expect(scrollTo).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: 'auto' }),
      );
    });
  });
});
