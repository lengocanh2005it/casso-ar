import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  API_BASE_URL: 'http://localhost:3000',
  authTokenManager: {
    getValidAccessToken: vi.fn().mockResolvedValue('token-1'),
  },
}));

import {
  getCopilotConversationMessages,
  listCopilotConversations,
  streamCopilotMessage,
} from './copilot-api';

function sseResponse(events: Array<{ event: string; data: unknown }>) {
  const body = events
    .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join('');
  return new Response(body, { status: 200 });
}

describe('copilot-api', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('lists conversations with pagination params', async () => {
    apiRequest.mockResolvedValue({ items: [], total: 0 });

    await listCopilotConversations(2, 10);

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/copilot/conversations',
      method: 'GET',
      params: { page: 2, limit: 10 },
    });
  });

  it('gets conversation messages by id', async () => {
    apiRequest.mockResolvedValue({ items: [] });

    await getCopilotConversationMessages('c1');

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/copilot/conversations/c1/messages',
      method: 'GET',
    });
  });

  it('streams status, delta, and done events from the SSE response', async () => {
    const doneMessage = {
      id: 'm1',
      role: 'ASSISTANT',
      content: 'Xin chào',
      createdAt: '2026-08-09T00:00:00Z',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          { event: 'status', data: { text: 'Đang xử lý…' } },
          { event: 'delta', data: { text: 'Xin' } },
          { event: 'delta', data: { text: ' chào' } },
          {
            event: 'done',
            data: { message: doneMessage, pendingAction: null },
          },
        ]),
      ),
    );
    const onEvent = vi.fn();
    const controller = new AbortController();

    await streamCopilotMessage('c1', 'Xin chào', onEvent, controller.signal);

    expect(onEvent).toHaveBeenNthCalledWith(1, {
      type: 'status',
      text: 'Đang xử lý…',
    });
    expect(onEvent).toHaveBeenNthCalledWith(2, { type: 'delta', text: 'Xin' });
    expect(onEvent).toHaveBeenNthCalledWith(3, {
      type: 'delta',
      text: ' chào',
    });
    expect(onEvent).toHaveBeenNthCalledWith(4, {
      type: 'done',
      data: { message: doneMessage, pendingAction: null },
    });
    vi.unstubAllGlobals();
  });

  it('skips a malformed SSE chunk instead of forwarding garbage to onEvent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          { event: 'delta', data: { notText: 'oops' } },
          { event: 'delta', data: { text: 'Xin chào' } },
        ]),
      ),
    );
    const onEvent = vi.fn();
    const controller = new AbortController();

    await streamCopilotMessage('c1', 'Xin chào', onEvent, controller.signal);

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ type: 'delta', text: 'Xin chào' });
    vi.unstubAllGlobals();
  });

  it('skips an unrecognized SSE event type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          { event: 'ping', data: {} },
          { event: 'delta', data: { text: 'Xin chào' } },
        ]),
      ),
    );
    const onEvent = vi.fn();
    const controller = new AbortController();

    await streamCopilotMessage('c1', 'Xin chào', onEvent, controller.signal);

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ type: 'delta', text: 'Xin chào' });
    vi.unstubAllGlobals();
  });
});
