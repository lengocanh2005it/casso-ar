import { act, renderHook, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listCopilotConversations } = vi.hoisted(() => ({
  listCopilotConversations: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('./copilot-api', () => ({
  listCopilotConversations: (...args: unknown[]) =>
    listCopilotConversations(...args),
}));

import { useCopilotConversations } from './use-copilot-conversations';

describe('useCopilotConversations', () => {
  beforeEach(() => {
    listCopilotConversations.mockReset();
    listCopilotConversations.mockResolvedValue({ items: [], total: 0 });
    vi.mocked(toast.error).mockReset();
  });

  it('loads conversations on mount', async () => {
    listCopilotConversations.mockResolvedValue({
      items: [
        { id: 'c1', title: 'Hỏi công nợ', createdAt: '', lastMessageAt: '' },
      ],
      total: 1,
    });
    const { result } = renderHook(() => useCopilotConversations());

    await waitFor(() => expect(result.current.conversations).toHaveLength(1));
  });

  it('keeps the loaded list and toasts when a refresh fails', async () => {
    listCopilotConversations.mockResolvedValueOnce({
      items: [
        { id: 'c1', title: 'Hỏi công nợ', createdAt: '', lastMessageAt: '' },
      ],
      total: 1,
    });
    const { result } = renderHook(() => useCopilotConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));

    listCopilotConversations.mockRejectedValueOnce(new Error('network down'));
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.isLoading).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Không thể tải lịch sử chat.');
  });

  it('appends the next page and reports when every conversation is loaded', async () => {
    const conversation = (id: string) => ({
      id,
      title: `Cuộc trò chuyện ${id}`,
      createdAt: '',
      lastMessageAt: '',
    });
    listCopilotConversations.mockResolvedValueOnce({
      items: [conversation('c1')],
      total: 2,
    });
    const { result } = renderHook(() => useCopilotConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));
    expect(result.current.hasMore).toBe(true);

    listCopilotConversations.mockResolvedValueOnce({
      items: [conversation('c2')],
      total: 2,
    });
    await act(async () => {
      await result.current.loadMore();
    });

    expect(listCopilotConversations).toHaveBeenLastCalledWith(2, 20);
    expect(result.current.conversations.map((item) => item.id)).toEqual([
      'c1',
      'c2',
    ]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.isLoadingMore).toBe(false);
  });

  it('keeps the rows loaded beyond page one when a refresh replaces page one', async () => {
    const conversation = (id: string) => ({
      id,
      title: `Cuộc trò chuyện ${id}`,
      createdAt: '',
      lastMessageAt: '',
    });
    listCopilotConversations.mockResolvedValueOnce({
      items: [conversation('c1')],
      total: 3,
    });
    const { result } = renderHook(() => useCopilotConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));

    listCopilotConversations.mockResolvedValueOnce({
      items: [conversation('c2'), conversation('c3')],
      total: 3,
    });
    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.conversations.map((item) => item.id)).toEqual([
      'c1',
      'c2',
      'c3',
    ]);

    listCopilotConversations.mockResolvedValueOnce({
      items: [conversation('c0'), conversation('c1')],
      total: 3,
    });
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.conversations.map((item) => item.id)).toEqual([
      'c0',
      'c1',
      'c2',
      'c3',
    ]);
    expect(result.current.hasMore).toBe(false);
  });

  it('does not append the same conversation twice when paging shifts', async () => {
    const conversation = (id: string) => ({
      id,
      title: `Cuộc trò chuyện ${id}`,
      createdAt: '',
      lastMessageAt: '',
    });
    listCopilotConversations.mockResolvedValueOnce({
      items: [conversation('c1'), conversation('c2')],
      total: 4,
    });
    const { result } = renderHook(() => useCopilotConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(2));

    // A newer conversation pushed the window down: c2 is on page two again.
    listCopilotConversations.mockResolvedValueOnce({
      items: [conversation('c2'), conversation('c3')],
      total: 4,
    });
    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.conversations.map((item) => item.id)).toEqual([
      'c1',
      'c2',
      'c3',
    ]);
  });

  it('ignores a load-more that started before a newer refresh', async () => {
    const conversation = (id: string) => ({
      id,
      title: `Cuộc trò chuyện ${id}`,
      createdAt: '',
      lastMessageAt: '',
    });
    listCopilotConversations.mockResolvedValueOnce({
      items: [conversation('c1')],
      total: 3,
    });
    const { result } = renderHook(() => useCopilotConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));

    let resolveStaleLoadMore: (value: unknown) => void = () => {};
    listCopilotConversations.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStaleLoadMore = resolve;
      }),
    );
    let staleLoadMore: Promise<void> = Promise.resolve();
    act(() => {
      staleLoadMore = result.current.loadMore();
    });

    // Page one is unchanged, so a stale page two would only add rows.
    listCopilotConversations.mockResolvedValueOnce({
      items: [conversation('c1')],
      total: 3,
    });
    await act(async () => {
      await result.current.refresh();
    });

    await act(async () => {
      resolveStaleLoadMore({
        items: [conversation('c2'), conversation('c3')],
        total: 3,
      });
      await staleLoadMore;
    });

    expect(result.current.conversations.map((item) => item.id)).toEqual(['c1']);
  });

  it('clears isLoadingMore when a refresh lands before load-more resolves', async () => {
    const conversation = (id: string) => ({
      id,
      title: `Cuộc trò chuyện ${id}`,
      createdAt: '',
      lastMessageAt: '',
    });
    listCopilotConversations.mockResolvedValueOnce({
      items: [conversation('c1')],
      total: 3,
    });
    const { result } = renderHook(() => useCopilotConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));

    let resolveStaleLoadMore: (value: unknown) => void = () => {};
    listCopilotConversations.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStaleLoadMore = resolve;
      }),
    );
    let staleLoadMore: Promise<void> = Promise.resolve();
    act(() => {
      staleLoadMore = result.current.loadMore();
    });
    expect(result.current.isLoadingMore).toBe(true);

    // A finished turn refreshes while that page is still in flight.
    listCopilotConversations.mockResolvedValueOnce({
      items: [conversation('c1')],
      total: 3,
    });
    await act(async () => {
      await result.current.refresh();
    });

    await act(async () => {
      resolveStaleLoadMore({
        items: [conversation('c2')],
        total: 3,
      });
      await staleLoadMore;
    });

    expect(result.current.isLoadingMore).toBe(false);
    expect(result.current.conversations.map((item) => item.id)).toEqual(['c1']);
  });

  it('startNewConversation swaps to a fresh id and selectConversation switches to an existing one', async () => {
    const { result } = renderHook(() => useCopilotConversations());
    await waitFor(() => expect(listCopilotConversations).toHaveBeenCalled());
    const firstId = result.current.activeConversationId;

    act(() => result.current.startNewConversation());
    expect(result.current.activeConversationId).not.toBe(firstId);

    act(() => result.current.selectConversation('c1'));
    expect(result.current.activeConversationId).toBe('c1');
  });
});
