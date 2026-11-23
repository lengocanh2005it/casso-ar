import { act, renderHook, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  streamCopilotMessage,
  confirmCopilotAction,
  cancelCopilotAction,
  getCopilotConversationMessages,
} = vi.hoisted(() => ({
  streamCopilotMessage: vi.fn(),
  confirmCopilotAction: vi.fn(),
  cancelCopilotAction: vi.fn(),
  getCopilotConversationMessages: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('./copilot-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./copilot-api')>();
  return {
    CopilotStreamRequestError: actual.CopilotStreamRequestError,
    streamCopilotMessage: (...args: unknown[]) => streamCopilotMessage(...args),
    confirmCopilotAction: (...args: unknown[]) => confirmCopilotAction(...args),
    cancelCopilotAction: (...args: unknown[]) => cancelCopilotAction(...args),
    getCopilotConversationMessages: (...args: unknown[]) =>
      getCopilotConversationMessages(...args),
  };
});

import { CopilotStreamRequestError } from './copilot-api';
import { useCopilotChat } from './use-copilot';

describe('useCopilotChat', () => {
  beforeEach(() => {
    streamCopilotMessage.mockReset();
    getCopilotConversationMessages.mockReset();
    getCopilotConversationMessages.mockResolvedValue({ items: [] });
  });

  it('loads the conversation history when switching to an existing conversation', async () => {
    getCopilotConversationMessages.mockResolvedValue({
      items: [
        {
          id: 'm1',
          role: 'USER',
          content: 'Câu hỏi cũ',
          createdAt: '2026-08-09T00:00:00Z',
        },
        {
          id: 'm2',
          role: 'ASSISTANT',
          content: 'Câu trả lời cũ',
          createdAt: '2026-08-09T00:00:01Z',
        },
      ],
    });
    const { result } = renderHook(() => useCopilotChat(true, 'conversation-1'));

    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(getCopilotConversationMessages).toHaveBeenCalledWith(
      'conversation-1',
    );
    expect(result.current.messages[0]).toMatchObject({
      content: 'Câu hỏi cũ',
    });
  });

  it('reports isLoadingHistory as true only while a conversation is being fetched', async () => {
    let resolveLoad: (page: { items: never[] }) => void = () => {};
    getCopilotConversationMessages.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
    );
    const { result } = renderHook(() => useCopilotChat(true, 'conversation-1'));

    expect(result.current.isLoadingHistory).toBe(true);

    await act(async () => {
      resolveLoad({ items: [] });
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false));
  });

  it('clears messages and loads the new conversation when conversationId changes', async () => {
    getCopilotConversationMessages.mockResolvedValueOnce({ items: [] });
    const { result, rerender } = renderHook(
      ({ conversationId }) => useCopilotChat(true, conversationId),
      { initialProps: { conversationId: 'conversation-1' } },
    );
    await waitFor(() =>
      expect(getCopilotConversationMessages).toHaveBeenCalledWith(
        'conversation-1',
      ),
    );

    getCopilotConversationMessages.mockResolvedValueOnce({
      items: [
        {
          id: 'm3',
          role: 'USER',
          content: 'Câu hỏi khác',
          createdAt: '2026-08-09T00:00:00Z',
        },
      ],
    });
    rerender({ conversationId: 'conversation-2' });

    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages[0]).toMatchObject({
      content: 'Câu hỏi khác',
    });
    expect(getCopilotConversationMessages).toHaveBeenCalledWith(
      'conversation-2',
    );
  });

  it('accumulates delta events into streamingContent, then commits the done message', async () => {
    streamCopilotMessage.mockImplementation(async (_id, _content, onEvent) => {
      onEvent({ type: 'delta', text: 'Xin' });
      onEvent({ type: 'delta', text: ' chào' });
      onEvent({
        type: 'done',
        data: {
          message: {
            id: 'm1',
            role: 'ASSISTANT',
            content: 'Xin chào',
            createdAt: '2026-08-09T00:00:00Z',
          },
          pendingAction: null,
        },
      });
    });
    const { result } = renderHook(() => useCopilotChat(true, 'conversation-1'));

    await act(async () => {
      await result.current.send('Xin chào');
    });

    await waitFor(() => expect(result.current.streamingContent).toBe(''));
    expect(result.current.messages.at(-1)).toMatchObject({
      role: 'ASSISTANT',
      content: 'Xin chào',
    });
  });

  it('locks sending and rolls back the optimistic message when the plan quota is exceeded', async () => {
    streamCopilotMessage.mockRejectedValue(
      new CopilotStreamRequestError(
        'Đã đạt giới hạn gói FREE; vui lòng nâng cấp để tiếp tục.',
        'PLAN_LIMIT_EXCEEDED',
      ),
    );
    const { result } = renderHook(() => useCopilotChat(true, 'conversation-1'));
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false));

    await act(async () => {
      await result.current.send('Câu hỏi thừa quota');
    });

    expect(result.current.quotaExceededMessage).toBe(
      'Đã đạt giới hạn gói FREE; vui lòng nâng cấp để tiếp tục.',
    );
    expect(result.current.messages).toHaveLength(0);

    streamCopilotMessage.mockClear();
    await act(async () => {
      await result.current.send('Thử lại');
    });
    expect(streamCopilotMessage).not.toHaveBeenCalled();
  });

  it('stop() aborts the in-flight stream without throwing an unhandled error', async () => {
    let rejectStream: (reason: unknown) => void = () => {};
    streamCopilotMessage.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectStream = reject;
        }),
    );
    const { result } = renderHook(() => useCopilotChat(true, 'conversation-1'));

    let sendPromise: Promise<boolean>;
    act(() => {
      sendPromise = result.current.send('Câu hỏi dài');
    });
    act(() => {
      result.current.stop();
      rejectStream(new DOMException('aborted', 'AbortError'));
    });

    await act(async () => {
      await sendPromise;
    });
    expect(result.current.isSending).toBe(false);
  });

  it('keeps the streamed-so-far text as a partial message when aborted mid-stream', async () => {
    let rejectStream: (reason: unknown) => void = () => {};
    let capturedOnEvent: ((event: unknown) => void) | null = null;
    streamCopilotMessage.mockImplementation(
      (
        _id: string,
        _content: string,
        onEvent: (event: unknown) => void,
        _signal: AbortSignal,
        onAccepted?: () => void,
      ) => {
        onAccepted?.();
        return new Promise((_resolve, reject) => {
          capturedOnEvent = onEvent;
          rejectStream = reject;
        });
      },
    );
    const { result } = renderHook(() => useCopilotChat(true, 'conversation-1'));

    let sendPromise: Promise<boolean>;
    act(() => {
      sendPromise = result.current.send('Câu hỏi dài');
    });
    act(() => {
      capturedOnEvent?.({ type: 'delta', text: 'Đang trả lời' });
    });
    act(() => {
      result.current.stop();
      rejectStream(new DOMException('aborted', 'AbortError'));
    });

    await act(async () => {
      await sendPromise;
    });

    expect(result.current.streamingContent).toBe('');
    expect(result.current.messages.at(-1)).toMatchObject({
      role: 'ASSISTANT',
      content: 'Đang trả lời',
      isPartial: true,
    });
  });

  it('does not append the streamed text twice when Stop follows a done event', async () => {
    let rejectStream: (reason: unknown) => void = () => {};
    let capturedOnEvent: ((event: unknown) => void) | null = null;
    streamCopilotMessage.mockImplementation(
      (
        _id: string,
        _content: string,
        onEvent: (event: unknown) => void,
        _signal: AbortSignal,
        onAccepted?: () => void,
      ) => {
        onAccepted?.();
        capturedOnEvent = onEvent;
        return new Promise((_resolve, reject) => {
          rejectStream = reject;
        });
      },
    );
    const { result } = renderHook(() => useCopilotChat(true, 'conversation-1'));

    let sendPromise: Promise<boolean>;
    act(() => {
      sendPromise = result.current.send('Câu hỏi dài');
    });
    act(() => {
      capturedOnEvent?.({ type: 'delta', text: 'Đang trả lời' });
      capturedOnEvent?.({
        type: 'done',
        data: {
          message: {
            id: 'm1',
            role: 'ASSISTANT',
            content: 'Đang trả lời',
            createdAt: '2026-08-09T00:00:00Z',
          },
          pendingAction: null,
        },
      });
    });
    act(() => {
      result.current.stop();
      rejectStream(new DOMException('aborted', 'AbortError'));
    });

    await act(async () => {
      await sendPromise;
    });

    const assistantMessages = result.current.messages.filter(
      (message) => message.role === 'ASSISTANT',
    );
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0]).toMatchObject({ id: 'm1' });
    expect(assistantMessages[0].isPartial).toBeUndefined();
  });

  it('reports whether a conversation is still the live one', async () => {
    const { result, rerender } = renderHook(
      ({ conversationId }) => useCopilotChat(true, conversationId),
      { initialProps: { conversationId: 'conversation-a' } },
    );
    expect(result.current.isActiveConversation('conversation-a')).toBe(true);

    getCopilotConversationMessages.mockResolvedValueOnce({ items: [] });
    await act(async () => {
      rerender({ conversationId: 'conversation-b' });
    });
    expect(result.current.isActiveConversation('conversation-a')).toBe(false);
    expect(result.current.isActiveConversation('conversation-b')).toBe(true);
  });

  it('does not add a partial message when aborted before any delta arrived', async () => {
    let rejectStream: (reason: unknown) => void = () => {};
    streamCopilotMessage.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectStream = reject;
        }),
    );
    const { result } = renderHook(() => useCopilotChat(true, 'conversation-1'));

    let sendPromise: Promise<boolean>;
    act(() => {
      sendPromise = result.current.send('Câu hỏi dài');
    });
    act(() => {
      result.current.stop();
      rejectStream(new DOMException('aborted', 'AbortError'));
    });

    await act(async () => {
      await sendPromise;
    });

    expect(result.current.messages.at(-1)).toMatchObject({ role: 'USER' });
  });

  it('reports the turn as complete when the stream is aborted mid-answer', async () => {
    let rejectStream: (reason: unknown) => void = () => {};
    streamCopilotMessage.mockImplementation(
      (
        _id: string,
        _content: string,
        _onEvent: (event: unknown) => void,
        _signal: AbortSignal,
        onAccepted?: () => void,
      ) => {
        onAccepted?.();
        return new Promise((_resolve, reject) => {
          rejectStream = reject;
        });
      },
    );
    const onTurnComplete = vi.fn();
    const { result } = renderHook(() =>
      useCopilotChat(true, 'conversation-1', { onTurnComplete }),
    );

    let sendPromise: Promise<boolean>;
    act(() => {
      sendPromise = result.current.send('Câu hỏi dài');
    });
    act(() => {
      result.current.stop();
      rejectStream(new DOMException('aborted', 'AbortError'));
    });

    await act(async () => {
      await sendPromise;
    });

    expect(onTurnComplete).toHaveBeenCalledTimes(1);
  });

  it('does not report a turn that was rejected before it was persisted', async () => {
    streamCopilotMessage.mockRejectedValue(
      new CopilotStreamRequestError(
        'Câu hỏi không hợp lệ.',
        'VALIDATION_ERROR',
      ),
    );
    const onTurnComplete = vi.fn();
    const { result } = renderHook(() =>
      useCopilotChat(true, 'conversation-1', { onTurnComplete }),
    );

    await act(async () => {
      await result.current.send('Câu hỏi dài');
    });

    expect(onTurnComplete).not.toHaveBeenCalled();
  });

  describe('pending action expiry', () => {
    const PENDING_ACTION = {
      id: 'pa1',
      actionType: 'SEND_REMINDER_EMAIL',
      status: 'PENDING',
      payload: { draftId: 'd1', receivableId: 'r1' },
      receivableLabel: null,
      createdAt: '2026-08-09T00:00:00Z',
      resolvedAt: null,
    };

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      // The fixture's createdAt is 2026-08-09; start just after it so the
      // proposal is live, then let each test move the clock.
      vi.setSystemTime(new Date('2026-08-09T00:05:00Z'));
      confirmCopilotAction.mockReset();
      cancelCopilotAction.mockReset();
      vi.mocked(toast.info).mockReset();
      vi.mocked(toast.error).mockReset();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function sendWithPendingAction() {
      streamCopilotMessage.mockImplementation(
        async (_id, _content, onEvent) => {
          onEvent({
            type: 'done',
            data: {
              message: {
                id: 'm1',
                role: 'ASSISTANT',
                content: 'Đã soạn đề xuất.',
                createdAt: '2026-08-09T00:00:00Z',
              },
              pendingAction: PENDING_ACTION,
            },
          });
        },
      );
    }

    it('clears an expired pending action, toasts, and unblocks sending', async () => {
      sendWithPendingAction();
      const { result } = renderHook(() =>
        useCopilotChat(true, 'conversation-1'),
      );

      await act(async () => {
        await result.current.send('Soạn email nhắc');
      });
      expect(result.current.pendingAction).not.toBeNull();
      expect(result.current.blockedByPendingAction).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(10 * 60 * 1000 + 1);
      });

      expect(result.current.pendingAction).toBeNull();
      expect(result.current.blockedByPendingAction).toBe(false);
      expect(toast.info).toHaveBeenCalledWith('Đề xuất gửi email đã hết hạn.');

      streamCopilotMessage.mockClear();
      await act(async () => {
        await result.current.send('Câu hỏi tiếp theo');
      });
      expect(streamCopilotMessage).toHaveBeenCalledTimes(1);
    });

    it('clears a pending action that is already expired when set', async () => {
      vi.setSystemTime(new Date('2026-08-09T00:30:00Z'));
      sendWithPendingAction();
      const { result } = renderHook(() =>
        useCopilotChat(true, 'conversation-1'),
      );

      await act(async () => {
        await result.current.send('Soạn email nhắc');
      });

      expect(result.current.pendingAction).toBeNull();
      expect(toast.info).toHaveBeenCalledWith('Đề xuất gửi email đã hết hạn.');
    });

    it('clears the pending action when confirm reports it is no longer pending', async () => {
      sendWithPendingAction();
      confirmCopilotAction.mockRejectedValue({
        response: {
          status: 409,
          data: {
            errorCode: 'CONFLICT',
            message: 'Đề xuất gửi email đã hết hạn.',
          },
        },
      });
      const { result } = renderHook(() =>
        useCopilotChat(true, 'conversation-1'),
      );

      await act(async () => {
        await result.current.send('Soạn email nhắc');
      });
      await act(async () => {
        await result.current.confirm();
      });

      expect(result.current.pendingAction).toBeNull();
      expect(toast.info).toHaveBeenCalledWith(
        'Đề xuất gửi email không còn hiệu lực. Vui lòng kiểm tra lại.',
      );
    });

    it('keeps the pending action when confirm fails for another reason', async () => {
      sendWithPendingAction();
      confirmCopilotAction.mockRejectedValue({
        response: {
          status: 500,
          data: { errorCode: 'INTERNAL_SERVER_ERROR', message: 'Lỗi.' },
        },
      });
      const { result } = renderHook(() =>
        useCopilotChat(true, 'conversation-1'),
      );

      await act(async () => {
        await result.current.send('Soạn email nhắc');
      });
      await act(async () => {
        await result.current.confirm();
      });

      expect(result.current.pendingAction).not.toBeNull();
      expect(toast.error).toHaveBeenCalledWith(
        'Không thể gửi email nhắc thanh toán.',
      );
    });

    it('leaves the next conversation pending action alone when a confirm resolves late', async () => {
      sendWithPendingAction();
      let resolveConfirm: () => void = () => {};
      confirmCopilotAction.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveConfirm = () => resolve({ reminderExecutionId: 'r1' });
          }),
      );
      const NEXT_ACTION = {
        id: 'pa2',
        actionType: 'SEND_REMINDER_EMAIL',
        status: 'PENDING',
        payload: { draftId: 'd2', receivableId: 'r2' },
        receivableLabel: null,
        createdAt: new Date().toISOString(),
        resolvedAt: null,
      };
      const { result, rerender } = renderHook(
        ({ conversationId }) => useCopilotChat(true, conversationId),
        { initialProps: { conversationId: 'conversation-a' } },
      );

      await act(async () => {
        await result.current.send('Soạn email nhắc');
      });

      let confirmPromise: Promise<void>;
      act(() => {
        confirmPromise = result.current.confirm();
      });

      getCopilotConversationMessages.mockResolvedValueOnce({ items: [] });
      rerender({ conversationId: 'conversation-b' });
      // Conversation B has its own fresh proposal to resolve.
      act(() => {
        streamCopilotMessage.mockImplementationOnce(
          async (_id, _content, onEvent, _signal, onAccepted?: () => void) => {
            onAccepted?.();
            onEvent({
              type: 'done',
              data: {
                message: {
                  id: 'm2',
                  role: 'ASSISTANT',
                  content: 'Đã soạn đề xuất khác.',
                  createdAt: new Date().toISOString(),
                },
                pendingAction: NEXT_ACTION,
              },
            });
          },
        );
      });
      await act(async () => {
        await result.current.send('Soạn email nhắc lần hai');
      });
      expect(result.current.pendingAction?.id).toBe('pa2');

      await act(async () => {
        resolveConfirm();
        await confirmPromise;
      });

      expect(result.current.pendingAction?.id).toBe('pa2');
      expect(result.current.busy).toBe(false);
      expect(result.current.busyAction).toBeNull();
    });

    it('does not carry a busy action into the next conversation', async () => {
      sendWithPendingAction();
      const resolvers: Array<() => void> = [];
      confirmCopilotAction.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvers.push(() => resolve({ reminderExecutionId: 'r1' }));
          }),
      );
      const { result, rerender } = renderHook(
        ({ conversationId }) => useCopilotChat(true, conversationId),
        { initialProps: { conversationId: 'conversation-a' } },
      );

      await act(async () => {
        await result.current.send('Soạn email nhắc');
      });
      let confirmA: Promise<void>;
      act(() => {
        confirmA = result.current.confirm();
      });
      expect(result.current.busyAction).toBe('confirm');

      getCopilotConversationMessages.mockResolvedValueOnce({ items: [] });
      rerender({ conversationId: 'conversation-b' });
      expect(result.current.busyAction).toBeNull();
      expect(result.current.busy).toBe(false);

      // B has its own proposal, and its own in-flight confirm.
      streamCopilotMessage.mockImplementationOnce(
        async (_id, _content, onEvent, _signal, onAccepted?: () => void) => {
          onAccepted?.();
          onEvent({
            type: 'done',
            data: {
              message: {
                id: 'm2',
                role: 'ASSISTANT',
                content: 'Đã soạn đề xuất khác.',
                createdAt: new Date().toISOString(),
              },
              pendingAction: {
                id: 'pa2',
                actionType: 'SEND_REMINDER_EMAIL',
                status: 'PENDING',
                payload: { draftId: 'd2', receivableId: 'r2' },
                receivableLabel: null,
                createdAt: new Date().toISOString(),
                resolvedAt: null,
              },
            },
          });
        },
      );
      await act(async () => {
        await result.current.send('Soạn email nhắc lần hai');
      });
      let confirmB: Promise<void>;
      act(() => {
        confirmB = result.current.confirm();
      });
      expect(result.current.busyAction).toBe('confirm');

      // A settling must not clear B's in-flight state.
      await act(async () => {
        resolvers[0]();
        await confirmA;
      });
      expect(result.current.busyAction).toBe('confirm');
      expect(result.current.pendingAction?.id).toBe('pa2');

      await act(async () => {
        resolvers[1]();
        await confirmB;
      });
      expect(result.current.busyAction).toBeNull();
    });

    it('reports which action is running while it is busy', async () => {
      sendWithPendingAction();
      let resolveConfirm: () => void = () => {};
      confirmCopilotAction.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveConfirm = () => resolve({ reminderExecutionId: 'r1' });
          }),
      );
      const { result } = renderHook(() =>
        useCopilotChat(true, 'conversation-1'),
      );

      await act(async () => {
        await result.current.send('Soạn email nhắc');
      });
      expect(result.current.busyAction).toBeNull();

      let confirmPromise: Promise<void>;
      act(() => {
        confirmPromise = result.current.confirm();
      });
      expect(result.current.busy).toBe(true);
      expect(result.current.busyAction).toBe('confirm');

      await act(async () => {
        resolveConfirm();
        await confirmPromise;
      });
      expect(result.current.busy).toBe(false);
      expect(result.current.busyAction).toBeNull();
    });

    it('reports cancel as the running action', async () => {
      sendWithPendingAction();
      let resolveCancel: () => void = () => {};
      cancelCopilotAction.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveCancel = () => resolve(PENDING_ACTION);
          }),
      );
      const { result } = renderHook(() =>
        useCopilotChat(true, 'conversation-1'),
      );

      await act(async () => {
        await result.current.send('Soạn email nhắc');
      });

      let cancelPromise: Promise<void>;
      act(() => {
        cancelPromise = result.current.cancel();
      });
      expect(result.current.busyAction).toBe('cancel');

      await act(async () => {
        resolveCancel();
        await cancelPromise;
      });
      expect(result.current.busyAction).toBeNull();
    });

    it('clears the pending action when cancel reports it is no longer pending', async () => {
      sendWithPendingAction();
      cancelCopilotAction.mockRejectedValue({
        response: {
          status: 409,
          data: {
            errorCode: 'CONFLICT',
            message: 'Đề xuất gửi email đã được xử lý.',
          },
        },
      });
      const { result } = renderHook(() =>
        useCopilotChat(true, 'conversation-1'),
      );

      await act(async () => {
        await result.current.send('Soạn email nhắc');
      });
      await act(async () => {
        await result.current.cancel();
      });

      expect(result.current.pendingAction).toBeNull();
      expect(toast.info).toHaveBeenCalledWith(
        'Đề xuất gửi email không còn hiệu lực. Vui lòng kiểm tra lại.',
      );
    });

    it('does not expire a pending action whose createdAt cannot be parsed', async () => {
      sendWithPendingAction();
      const { result } = renderHook(() =>
        useCopilotChat(true, 'conversation-1'),
      );

      streamCopilotMessage.mockImplementation(
        async (_id, _content, onEvent) => {
          onEvent({
            type: 'done',
            data: {
              message: {
                id: 'm1',
                role: 'ASSISTANT',
                content: 'Đã soạn đề xuất.',
                createdAt: '2026-08-09T00:00:00Z',
              },
              pendingAction: { ...PENDING_ACTION, createdAt: 'not-a-date' },
            },
          });
        },
      );
      await act(async () => {
        await result.current.send('Soạn email nhắc');
      });

      await act(async () => {
        vi.advanceTimersByTime(60 * 60 * 1000);
      });

      expect(result.current.pendingAction).not.toBeNull();
      expect(toast.info).not.toHaveBeenCalledWith(
        'Đề xuất gửi email đã hết hạn.',
      );
    });
  });

  describe('send result', () => {
    it('resolves true when the stream is accepted', async () => {
      streamCopilotMessage.mockImplementation(
        async (
          _id: string,
          _content: string,
          _onEvent: (event: unknown) => void,
          _signal: AbortSignal,
          onAccepted?: () => void,
        ) => {
          onAccepted?.();
        },
      );
      const { result } = renderHook(() =>
        useCopilotChat(true, 'conversation-1'),
      );

      let accepted = false;
      await act(async () => {
        accepted = await result.current.send('Câu hỏi');
      });

      expect(accepted).toBe(true);
    });

    it('resolves false when the request is rejected before it is accepted', async () => {
      streamCopilotMessage.mockRejectedValue(
        new CopilotStreamRequestError('Lỗi máy chủ.', 'INTERNAL_SERVER_ERROR'),
      );
      const { result } = renderHook(() =>
        useCopilotChat(true, 'conversation-1'),
      );

      let accepted = true;
      await act(async () => {
        accepted = await result.current.send('Câu hỏi');
      });

      expect(accepted).toBe(false);
    });

    it('resolves false when the network fails', async () => {
      streamCopilotMessage.mockRejectedValue(new TypeError('Failed to fetch'));
      const { result } = renderHook(() =>
        useCopilotChat(true, 'conversation-1'),
      );

      let accepted = true;
      await act(async () => {
        accepted = await result.current.send('Câu hỏi');
      });

      expect(accepted).toBe(false);
    });

    it('drops the optimistic question when the request never reached the server', async () => {
      streamCopilotMessage.mockRejectedValue(
        new CopilotStreamRequestError('Lỗi máy chủ.', 'INTERNAL_SERVER_ERROR'),
      );
      const { result } = renderHook(() =>
        useCopilotChat(true, 'conversation-1'),
      );

      await act(async () => {
        await result.current.send('Câu hỏi bị mất');
      });

      // The page hands the question back to the composer, so keeping the
      // bubble would show the same question twice.
      expect(result.current.messages).toEqual([]);
    });

    it('keeps the question and counts the turn when Stop lands before the first byte', async () => {
      const captured: {
        signal: AbortSignal | null;
        reject: (reason: unknown) => void;
      } = { signal: null, reject: () => {} };
      streamCopilotMessage.mockImplementation(
        (
          _id: string,
          _content: string,
          _onEvent: (event: unknown) => void,
          signal: AbortSignal,
        ) =>
          new Promise((_resolve, reject) => {
            captured.signal = signal;
            captured.reject = reject;
          }),
      );
      const onTurnComplete = vi.fn();
      const { result } = renderHook(() =>
        useCopilotChat(true, 'conversation-1', { onTurnComplete }),
      );

      let sendPromise: Promise<boolean>;
      act(() => {
        sendPromise = result.current.send('Câu hỏi dừng sớm');
      });
      act(() => {
        result.current.stop();
        captured.reject(new DOMException('aborted', 'AbortError'));
      });

      let accepted = false;
      await act(async () => {
        accepted = await sendPromise;
      });

      // The backend may already have counted the turn, so the page must not
      // hand the question back and usage must still refresh.
      expect(accepted).toBe(true);
      expect(onTurnComplete).toHaveBeenCalledTimes(1);
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0]).toMatchObject({
        role: 'USER',
        content: 'Câu hỏi dừng sớm',
      });
    });

    it('resolves true when the user aborts after the stream was accepted', async () => {
      let rejectStream: (reason: unknown) => void = () => {};
      streamCopilotMessage.mockImplementation(
        (
          _id: string,
          _content: string,
          _onEvent: (event: unknown) => void,
          _signal: AbortSignal,
          onAccepted?: () => void,
        ) => {
          onAccepted?.();
          return new Promise((_resolve, reject) => {
            rejectStream = reject;
          });
        },
      );
      const { result } = renderHook(() =>
        useCopilotChat(true, 'conversation-1'),
      );

      let sendPromise: Promise<boolean>;
      act(() => {
        sendPromise = result.current.send('Câu hỏi');
      });
      act(() => {
        result.current.stop();
        rejectStream(new DOMException('aborted', 'AbortError'));
      });

      let accepted = false;
      await act(async () => {
        accepted = await sendPromise;
      });
      expect(accepted).toBe(true);
    });
  });

  describe('failures after the server accepted the turn', () => {
    it('keeps the turn counted and the streamed text when the read fails mid-stream', async () => {
      const onTurnComplete = vi.fn();
      streamCopilotMessage.mockImplementation(
        async (
          _id: string,
          _content: string,
          onEvent: (event: unknown) => void,
          _signal: AbortSignal,
          onAccepted?: () => void,
        ) => {
          onAccepted?.();
          onEvent({ type: 'delta', text: 'Đang phân tích' });
          throw new TypeError('network error while reading the stream');
        },
      );
      const { result } = renderHook(() =>
        useCopilotChat(true, 'conversation-1', { onTurnComplete }),
      );

      let accepted = false;
      await act(async () => {
        accepted = await result.current.send('Phân tích công nợ');
      });

      expect(accepted).toBe(true);
      expect(onTurnComplete).toHaveBeenCalledTimes(1);
      expect(result.current.messages.at(-1)).toMatchObject({
        role: 'ASSISTANT',
        content: 'Đang phân tích',
        isPartial: true,
      });
      expect(toast.error).toHaveBeenCalledWith(
        'Kết nối với Copilot bị gián đoạn.',
      );
    });

    it('adds no message when the read fails before any delta', async () => {
      const onTurnComplete = vi.fn();
      streamCopilotMessage.mockImplementation(
        async (
          _id: string,
          _content: string,
          _onEvent: (event: unknown) => void,
          _signal: AbortSignal,
          onAccepted?: () => void,
        ) => {
          onAccepted?.();
          throw new TypeError('network error while reading the stream');
        },
      );
      const { result } = renderHook(() =>
        useCopilotChat(true, 'conversation-1', { onTurnComplete }),
      );

      let accepted = false;
      await act(async () => {
        accepted = await result.current.send('Phân tích công nợ');
      });

      expect(accepted).toBe(true);
      expect(onTurnComplete).toHaveBeenCalledTimes(1);
      expect(
        result.current.messages.filter(
          (message) => message.role === 'ASSISTANT',
        ),
      ).toHaveLength(0);
      expect(toast.error).toHaveBeenCalledWith(
        'Không thể gửi câu hỏi cho Copilot.',
      );
    });
  });

  describe('stream error events', () => {
    it('keeps the text streamed before an error event as a partial message', async () => {
      streamCopilotMessage.mockImplementation(
        async (_id, _content, onEvent) => {
          onEvent({ type: 'delta', text: 'Đang phân tích' });
          onEvent({
            type: 'error',
            errorCode: 'INTERNAL_SERVER_ERROR',
            message: 'Copilot tạm thời không phản hồi.',
          });
        },
      );
      const { result } = renderHook(() =>
        useCopilotChat(true, 'conversation-1'),
      );

      await act(async () => {
        await result.current.send('Phân tích công nợ');
      });

      expect(result.current.messages.at(-1)).toMatchObject({
        role: 'ASSISTANT',
        content: 'Đang phân tích',
        isPartial: true,
      });
      expect(result.current.streamingContent).toBe('');
      expect(toast.error).toHaveBeenCalledWith(
        'Copilot tạm thời không phản hồi.',
      );
    });

    it('drops the streaming bubble as soon as the error event lands', async () => {
      let fireError: () => void = () => {};
      streamCopilotMessage.mockImplementation(
        (_id: string, _content: string, onEvent: (event: unknown) => void) =>
          new Promise<void>((resolve) => {
            onEvent({ type: 'delta', text: 'Đang phân tích' });
            fireError = () => {
              onEvent({
                type: 'error',
                errorCode: 'INTERNAL_SERVER_ERROR',
                message: 'Copilot tạm thời không phản hồi.',
              });
              resolve();
            };
          }),
      );
      const { result } = renderHook(() =>
        useCopilotChat(true, 'conversation-1'),
      );

      let sendPromise: Promise<boolean>;
      act(() => {
        sendPromise = result.current.send('Phân tích công nợ');
      });
      expect(result.current.streamingContent).toBe('Đang phân tích');

      act(() => fireError());

      // The partial message already carries the text: leaving the streaming
      // bubble up would render the same answer twice until the stream closes.
      expect(result.current.streamingContent).toBe('');
      expect(
        result.current.messages.filter(
          (message) => message.role === 'ASSISTANT',
        ),
      ).toHaveLength(1);

      await act(async () => {
        await sendPromise;
      });
    });

    it('adds no message when the error arrives before any delta', async () => {
      streamCopilotMessage.mockImplementation(
        async (_id, _content, onEvent) => {
          onEvent({
            type: 'error',
            errorCode: 'INTERNAL_SERVER_ERROR',
            message: 'Copilot tạm thời không phản hồi.',
          });
        },
      );
      const { result } = renderHook(() =>
        useCopilotChat(true, 'conversation-1'),
      );

      await act(async () => {
        await result.current.send('Phân tích công nợ');
      });

      expect(
        result.current.messages.filter(
          (message) => message.role === 'ASSISTANT',
        ),
      ).toHaveLength(0);
      expect(toast.error).toHaveBeenCalledWith(
        'Copilot tạm thời không phản hồi.',
      );
    });

    it('keeps the done message and does not append the streamed text twice', async () => {
      streamCopilotMessage.mockImplementation(
        async (_id, _content, onEvent) => {
          onEvent({ type: 'delta', text: 'Xin chào' });
          onEvent({
            type: 'done',
            data: {
              message: {
                id: 'm1',
                role: 'ASSISTANT',
                content: 'Xin chào',
                createdAt: '2026-08-09T00:00:00Z',
              },
              pendingAction: null,
            },
          });
          onEvent({
            type: 'error',
            errorCode: 'INTERNAL_SERVER_ERROR',
            message: 'Copilot tạm thời không phản hồi.',
          });
        },
      );
      const { result } = renderHook(() =>
        useCopilotChat(true, 'conversation-1'),
      );

      await act(async () => {
        await result.current.send('Xin chào');
      });

      expect(
        result.current.messages.filter(
          (message) => message.role === 'ASSISTANT',
        ),
      ).toHaveLength(1);
      expect(result.current.messages.at(-1)).toMatchObject({
        id: 'm1',
        content: 'Xin chào',
      });
    });
  });

  describe('clean stream close', () => {
    it('keeps the streamed text when the stream closes without a done event', async () => {
      streamCopilotMessage.mockImplementation(
        async (
          _id: string,
          _content: string,
          onEvent: (event: unknown) => void,
          _signal: AbortSignal,
          onAccepted?: () => void,
        ) => {
          onAccepted?.();
          onEvent({ type: 'delta', text: 'Đang phân tích' });
        },
      );
      const { result } = renderHook(() =>
        useCopilotChat(true, 'conversation-1'),
      );
      const errorToastsBefore = vi.mocked(toast.error).mock.calls.length;

      await act(async () => {
        await result.current.send('Phân tích công nợ');
      });

      const assistantMessages = result.current.messages.filter(
        (message) => message.role === 'ASSISTANT',
      );
      expect(assistantMessages).toHaveLength(1);
      expect(assistantMessages[0]).toMatchObject({
        content: 'Đang phân tích',
        isPartial: true,
      });
      expect(result.current.streamingContent).toBe('');
      expect(vi.mocked(toast.error).mock.calls.length).toBe(errorToastsBefore);
    });

    it('adds no message when the stream closes without any delta', async () => {
      streamCopilotMessage.mockImplementation(
        async (
          _id: string,
          _content: string,
          _onEvent: (event: unknown) => void,
          _signal: AbortSignal,
          onAccepted?: () => void,
        ) => {
          onAccepted?.();
        },
      );
      const { result } = renderHook(() =>
        useCopilotChat(true, 'conversation-1'),
      );

      await act(async () => {
        await result.current.send('Phân tích công nợ');
      });

      expect(
        result.current.messages.filter(
          (message) => message.role === 'ASSISTANT',
        ),
      ).toHaveLength(0);
    });
  });

  describe('switching conversations mid-stream', () => {
    it('aborts the old stream and never writes into the new conversation', async () => {
      const captured: {
        onEvent: ((event: unknown) => void) | null;
        signal: AbortSignal | null;
        reject: (reason: unknown) => void;
      } = { onEvent: null, signal: null, reject: () => {} };
      streamCopilotMessage.mockImplementation(
        (
          _id: string,
          _content: string,
          onEvent: (event: unknown) => void,
          signal: AbortSignal,
          onAccepted?: () => void,
        ) => {
          onAccepted?.();
          return new Promise((_resolve, reject) => {
            captured.onEvent = onEvent;
            captured.signal = signal;
            captured.reject = reject;
          });
        },
      );
      const onTurnComplete = vi.fn();
      const { result, rerender } = renderHook(
        ({ conversationId }) =>
          useCopilotChat(true, conversationId, { onTurnComplete }),
        { initialProps: { conversationId: 'conversation-a' } },
      );

      let sendPromise: Promise<boolean>;
      act(() => {
        sendPromise = result.current.send('Câu hỏi cho A');
      });
      act(() => {
        captured.onEvent?.({ type: 'delta', text: 'Trả lời cho A' });
      });

      getCopilotConversationMessages.mockResolvedValueOnce({ items: [] });
      rerender({ conversationId: 'conversation-b' });

      // The old stream must be aborted, not left running into B.
      expect(captured.signal?.aborted).toBe(true);
      expect(result.current.isSending).toBe(false);
      expect(result.current.streamingContent).toBe('');

      await act(async () => {
        captured.reject(new DOMException('aborted', 'AbortError'));
        await sendPromise;
      });

      expect(result.current.messages).toEqual([]);
      expect(result.current.streamingContent).toBe('');
      expect(result.current.pendingAction).toBeNull();
      // The turn did reach the server, so usage/list still refresh.
      expect(onTurnComplete).toHaveBeenCalledTimes(1);
    });

    it('refreshes usage when the switch aborts before the first byte', async () => {
      const captured: {
        reject: (reason: unknown) => void;
        signal?: AbortSignal;
      } = { reject: () => {} };
      streamCopilotMessage.mockImplementation(
        (
          _id: string,
          _content: string,
          _onEvent: (event: unknown) => void,
          signal: AbortSignal,
        ) => {
          captured.signal = signal;
          return new Promise((_resolve, reject) => {
            captured.reject = reject;
          });
        },
      );
      const onTurnComplete = vi.fn();
      const { result, rerender } = renderHook(
        ({ conversationId }) =>
          useCopilotChat(true, conversationId, { onTurnComplete }),
        { initialProps: { conversationId: 'conversation-a' } },
      );

      let sendPromise: Promise<boolean>;
      act(() => {
        sendPromise = result.current.send('Câu hỏi cho A');
      });

      getCopilotConversationMessages.mockResolvedValueOnce({
        items: [
          {
            id: 'b1',
            role: 'USER',
            content: 'Câu hỏi của B',
            createdAt: '2026-08-09T00:00:00Z',
          },
        ],
      });
      rerender({ conversationId: 'conversation-b' });
      expect(captured.signal?.aborted).toBe(true);

      await act(async () => {
        captured.reject(new DOMException('aborted', 'AbortError'));
        await sendPromise;
      });

      // The backend bills the turn before the first byte, so usage must refresh
      // even though this client never saw the 2xx.
      expect(onTurnComplete).toHaveBeenCalledTimes(1);
      expect(result.current.messages.map((message) => message.id)).toEqual([
        'b1',
      ]);
      expect(result.current.streamingContent).toBe('');
      expect(result.current.pendingAction).toBeNull();
      expect(result.current.isSending).toBe(false);
    });

    it('leaves the new request abortable when switching back to the same conversation', async () => {
      const first: { reject: (reason: unknown) => void; signal?: AbortSignal } =
        { reject: () => {} };
      const second: { resolve: () => void; signal?: AbortSignal } = {
        resolve: () => {},
      };
      let call = 0;
      streamCopilotMessage.mockImplementation(
        (
          _id: string,
          _content: string,
          _onEvent: (event: unknown) => void,
          signal: AbortSignal,
          onAccepted?: () => void,
        ) => {
          onAccepted?.();
          call += 1;
          if (call === 1) {
            first.signal = signal;
            return new Promise((_resolve, reject) => {
              first.reject = reject;
            });
          }
          second.signal = signal;
          return new Promise<void>((resolve) => {
            second.resolve = resolve;
          });
        },
      );
      const { result, rerender } = renderHook(
        ({ conversationId }) => useCopilotChat(true, conversationId),
        { initialProps: { conversationId: 'conversation-a' } },
      );

      let firstSend: Promise<boolean>;
      act(() => {
        firstSend = result.current.send('Câu hỏi đầu');
      });

      getCopilotConversationMessages.mockResolvedValue({ items: [] });
      rerender({ conversationId: 'conversation-b' });
      rerender({ conversationId: 'conversation-a' });

      let secondSend: Promise<boolean>;
      act(() => {
        secondSend = result.current.send('Câu hỏi sau');
      });

      await act(async () => {
        first.reject(new DOMException('aborted', 'AbortError'));
        await firstSend;
      });

      // A finished request must not null the controller the new one owns.
      act(() => result.current.stop());
      expect(second.signal?.aborted).toBe(true);

      await act(async () => {
        second.resolve();
        await secondSend;
      });
    });

    it('ignores done and error events that arrive after the switch', async () => {
      const captured: {
        onEvent: ((event: unknown) => void) | null;
        resolve: () => void;
      } = { onEvent: null, resolve: () => {} };
      streamCopilotMessage.mockImplementation(
        async (
          _id: string,
          _content: string,
          onEvent: (event: unknown) => void,
          _signal: AbortSignal,
          onAccepted?: () => void,
        ) => {
          onAccepted?.();
          captured.onEvent = onEvent;
          await new Promise<void>((resolve) => {
            captured.resolve = resolve;
          });
        },
      );
      const { result, rerender } = renderHook(
        ({ conversationId }) => useCopilotChat(true, conversationId),
        { initialProps: { conversationId: 'conversation-a' } },
      );

      let sendPromise: Promise<boolean>;
      act(() => {
        sendPromise = result.current.send('Câu hỏi cho A');
      });

      getCopilotConversationMessages.mockResolvedValueOnce({ items: [] });
      rerender({ conversationId: 'conversation-b' });

      captured.onEvent?.({
        type: 'done',
        data: {
          message: {
            id: 'm-old',
            role: 'ASSISTANT',
            content: 'Trả lời cho A',
            createdAt: '2026-08-09T00:00:00Z',
          },
          pendingAction: {
            id: 'pa-old',
            actionType: 'SEND_REMINDER_EMAIL',
            status: 'PENDING',
            payload: { draftId: 'd1', receivableId: 'r1' },
            receivableLabel: null,
            createdAt: new Date().toISOString(),
            resolvedAt: null,
          },
        },
      });

      await act(async () => {
        captured.resolve();
        await sendPromise;
      });

      expect(result.current.messages).toEqual([]);
      expect(result.current.pendingAction).toBeNull();
    });
  });
});
