import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listCopilotConversations } = vi.hoisted(() => ({
  listCopilotConversations: vi.fn(),
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
