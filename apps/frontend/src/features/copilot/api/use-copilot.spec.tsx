import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { streamCopilotMessage, confirmCopilotAction, cancelCopilotAction } =
  vi.hoisted(() => ({
    streamCopilotMessage: vi.fn(),
    confirmCopilotAction: vi.fn(),
    cancelCopilotAction: vi.fn(),
  }));

vi.mock('./copilot-api', () => ({
  streamCopilotMessage: (...args: unknown[]) => streamCopilotMessage(...args),
  confirmCopilotAction: (...args: unknown[]) => confirmCopilotAction(...args),
  cancelCopilotAction: (...args: unknown[]) => cancelCopilotAction(...args),
}));

import { useCopilotChat } from './use-copilot';

describe('useCopilotChat', () => {
  beforeEach(() => {
    streamCopilotMessage.mockReset();
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

  it('stop() aborts the in-flight stream without throwing an unhandled error', async () => {
    let rejectStream: (reason: unknown) => void = () => {};
    streamCopilotMessage.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectStream = reject;
        }),
    );
    const { result } = renderHook(() => useCopilotChat(true, 'conversation-1'));

    let sendPromise: Promise<void>;
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
      (_id: string, _content: string, onEvent: (event: unknown) => void) =>
        new Promise((_resolve, reject) => {
          capturedOnEvent = onEvent;
          rejectStream = reject;
        }),
    );
    const { result } = renderHook(() => useCopilotChat(true, 'conversation-1'));

    let sendPromise: Promise<void>;
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

  it('does not add a partial message when aborted before any delta arrived', async () => {
    let rejectStream: (reason: unknown) => void = () => {};
    streamCopilotMessage.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectStream = reject;
        }),
    );
    const { result } = renderHook(() => useCopilotChat(true, 'conversation-1'));

    let sendPromise: Promise<void>;
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
});
