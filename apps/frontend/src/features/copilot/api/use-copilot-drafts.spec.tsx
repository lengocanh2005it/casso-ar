import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as draftsApi from './copilot-drafts-api';
import { useCopilotDrafts, useReopenCopilotDraft } from './use-copilot-drafts';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useCopilotDrafts', () => {
  it('fetches the drafts page for the given page/status', async () => {
    const fetchSpy = vi
      .spyOn(draftsApi, 'fetchCopilotDrafts')
      .mockResolvedValue({ items: [], total: 0 });

    const { result } = renderHook(() => useCopilotDrafts(1, 'CANCELLED'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledWith(1, 20, 'CANCELLED');
  });
});

describe('useReopenCopilotDraft', () => {
  it('calls reopenCopilotDraft with the draft id', async () => {
    const reopenSpy = vi
      .spyOn(draftsApi, 'reopenCopilotDraft')
      .mockResolvedValue({
        conversationId: 'conv-1',
        pendingAction: {
          id: 'action-1',
          actionType: 'SEND_REMINDER_EMAIL',
          status: 'PENDING',
          payload: { draftId: 'draft-1', receivableId: 'rec-1' },
          createdAt: '2026-08-14T10:00:00.000Z',
          resolvedAt: null,
        },
      });

    const { result } = renderHook(() => useReopenCopilotDraft(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('draft-1');
    });

    expect(reopenSpy).toHaveBeenCalledWith('draft-1');
  });
});
