import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getApiErrorCode } from '@/lib/api-client';
import type { CopilotMessage, CopilotPendingAction } from '../types';
import {
  CopilotStreamRequestError,
  cancelCopilotAction,
  confirmCopilotAction,
  getCopilotConversationMessages,
  streamCopilotMessage,
} from './copilot-api';

// Mirrors PENDING_ACTION_EXPIRY_MINUTES on the backend: a pending action that
// outlives this is refused server-side, so the UI must stop blocking the
// composer on it.
export const PENDING_ACTION_TTL_MS = 10 * 60 * 1000;
// Only the local TTL timer can claim expiry; a server CONFLICT also covers
// draft mismatch and already-resolved actions, so it gets the neutral wording.
const PENDING_ACTION_EXPIRED_MESSAGE = 'Đề xuất gửi email đã hết hạn.';
const PENDING_ACTION_STALE_MESSAGE =
  'Đề xuất gửi email không còn hiệu lực. Vui lòng kiểm tra lại.';

export function useCopilotChat(
  canResolvePendingAction: boolean,
  conversationId: string,
  options: { onTurnComplete?: () => void } = {},
) {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [pendingAction, setPendingAction] =
    useState<CopilotPendingAction | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [busyAction, setBusyAction] = useState<'confirm' | 'cancel' | null>(
    null,
  );
  const busy = busyAction !== null;
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [quotaExceededMessage, setQuotaExceededMessage] = useState<
    string | null
  >(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeConversationIdRef = useRef(conversationId);
  // Bumped whenever the conversation changes so a confirm/cancel started for
  // the previous one cannot clear the new one's busy state.
  const pendingActionRequestRef = useRef(0);
  const blockedByPendingAction =
    pendingAction !== null && canResolvePendingAction;

  useEffect(() => {
    let cancelled = false;
    activeConversationIdRef.current = conversationId;
    // A stream started for the previous conversation must stop writing into
    // this one, and the composer must not stay locked on its behalf.
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    pendingActionRequestRef.current += 1;
    setMessages([]);
    setPendingAction(null);
    setBusyAction(null);
    setIsSending(false);
    setStreamingContent('');
    setIsLoadingHistory(true);
    setQuotaExceededMessage(null);

    getCopilotConversationMessages(conversationId)
      .then((page) => {
        if (cancelled) return;
        // A send() started for this conversation before this load resolved
        // already has the up-to-date messages — don't clobber it with the
        // (now stale) fetched history.
        setMessages((current) => (current.length > 0 ? current : page.items));
      })
      .catch((error: unknown) => {
        if (cancelled || getApiErrorCode(error) === 'NOT_FOUND') return;
        toast.error('Không thể tải lịch sử cuộc trò chuyện.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingHistory(false);
      });

    return () => {
      cancelled = true;
      abortControllerRef.current?.abort();
    };
  }, [conversationId]);

  // An expired proposal is refused by the backend, so blocking the composer on
  // it would trap the input: drop it at the same moment the server would.
  useEffect(() => {
    if (!pendingAction) return;

    const expiresAt =
      new Date(pendingAction.createdAt).getTime() + PENDING_ACTION_TTL_MS;
    // An unparseable timestamp proves nothing about expiry; the server's
    // CONFLICT path still clears it when the proposal is actually dead.
    if (Number.isNaN(expiresAt)) return;

    const expiresIn = expiresAt - Date.now();
    if (expiresIn <= 0) {
      setPendingAction(null);
      toast.info(PENDING_ACTION_EXPIRED_MESSAGE);
      return;
    }

    const timer = setTimeout(() => {
      setPendingAction(null);
      toast.info(PENDING_ACTION_EXPIRED_MESSAGE);
    }, expiresIn);
    return () => clearTimeout(timer);
  }, [pendingAction]);

  // Resolves true once the server accepted the turn (2xx stream, even if it is
  // aborted later) and false when the request never reached the write.
  async function send(content: string): Promise<boolean> {
    const trimmed = content.trim();
    if (
      !trimmed ||
      isSending ||
      blockedByPendingAction ||
      quotaExceededMessage !== null
    ) {
      return false;
    }

    const sendConversationId = conversationId;
    const isCurrentConversation = () =>
      activeConversationIdRef.current === sendConversationId;

    setIsSending(true);
    setStreamingContent('');
    const optimisticMessageId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      {
        id: optimisticMessageId,
        role: 'USER',
        content: trimmed,
        createdAt: new Date().toISOString(),
      },
    ]);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let streamedText = '';
    // Once a done message (or a partial stand-in) is committed, a later error
    // event must not append the same answer a second time.
    let answerCommitted = false;
    // Only the API layer knows whether the 2xx response ever arrived; a fetch
    // that rejects and a stream that dies mid-read look the same from here.
    let accepted = false;
    const onAccepted = () => {
      accepted = true;
    };
    // A failure before the response headers leaves the outcome unknown: the
    // turn may have been billed even though this client cannot tell.
    let turnMayBeCounted = false;

    // The page restores the question into the composer on a `false` result,
    // so the optimistic bubble must go or the question would show twice.
    const dropOptimisticMessage = () => {
      if (!isCurrentConversation()) return;
      setMessages((current) =>
        current.filter((message) => message.id !== optimisticMessageId),
      );
    };

    const appendPartialAnswer = () => {
      if (!streamedText || answerCommitted) return;
      answerCommitted = true;
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'ASSISTANT',
          content: streamedText,
          createdAt: new Date().toISOString(),
          isPartial: true,
        },
      ]);
      // The message now carries the text; the streaming bubble would render
      // the same answer twice until the stream closes.
      setStreamingContent('');
    };

    // The backend persists the question before it flushes the SSE headers, so
    // a dropped connection cannot prove the write never happened. Only the
    // history can: match by content, since client and server clocks can
    // disagree.
    const reconcileOutcome = async (): Promise<
      'persisted' | 'lost' | 'unknown'
    > => {
      try {
        const page = await getCopilotConversationMessages(sendConversationId);
        const newestQuestion = page.items
          .filter((message) => message.role === 'USER')
          .at(-1);
        if (newestQuestion?.content.trim() !== trimmed) return 'lost';
        if (isCurrentConversation()) setMessages(page.items);
        return 'persisted';
      } catch {
        return 'unknown';
      }
    };

    try {
      await streamCopilotMessage(
        conversationId,
        trimmed,
        (event) => {
          // Everything the old conversation's stream still emits after the
          // switch belongs to that conversation, not the visible one.
          if (!isCurrentConversation()) return;

          if (event.type === 'delta') {
            streamedText += event.text;
            setStreamingContent((current) => current + event.text);
          } else if (event.type === 'done') {
            answerCommitted = true;
            setMessages((current) => [...current, event.data.message]);
            setPendingAction(event.data.pendingAction ?? null);
          } else if (event.type === 'error') {
            // The turn failed after it started answering: keep what the user
            // already read instead of dropping it on the floor.
            appendPartialAnswer();
            toast.error(event.message);
          }
        },
        controller.signal,
        onAccepted,
      );
      // A clean close with no done event still leaves readable text on screen.
      if (isCurrentConversation()) appendPartialAnswer();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        if (isCurrentConversation()) {
          // A user Stop can land before the first byte, but the backend
          // already persisted the turn: count it and keep the question.
          appendPartialAnswer();
        }
        // A switch aborts the same way, and the server may have counted the
        // turn before the first byte: refresh usage without touching B.
        accepted = true;
      } else if (accepted) {
        // The 2xx response arrived, so the server already persisted and counted
        // the turn: it resolves true and the question stays sent, with whatever
        // text was streamed kept on screen.
        if (isCurrentConversation()) appendPartialAnswer();
        toast.error(
          streamedText
            ? 'Kết nối với Copilot bị gián đoạn.'
            : 'Không thể gửi câu hỏi cho Copilot.',
        );
      } else if (error instanceof CopilotStreamRequestError) {
        // Rejected with a non-2xx status: the write never reached the database.
        dropOptimisticMessage();
        if (error.errorCode === 'PLAN_LIMIT_EXCEEDED') {
          if (isCurrentConversation()) setQuotaExceededMessage(error.message);
          toast.error(error.message);
        } else {
          toast.error('Không thể gửi câu hỏi cho Copilot.');
        }
      } else {
        const outcome = await reconcileOutcome();
        if (outcome === 'persisted') {
          // The turn was taken: the fetched page replaces the optimistic
          // bubble with the real message, so nothing is duplicated.
          accepted = true;
          toast.error(
            'Mất kết nối khi gửi. Câu hỏi đã được ghi nhận, hãy mở lại cuộc trò chuyện để xem phản hồi.',
          );
        } else if (outcome === 'lost') {
          dropOptimisticMessage();
          toast.error('Không thể gửi câu hỏi cho Copilot.');
        } else {
          // Still unknown: the page hands the question back, but the turn may
          // have been billed, so usage and the list must still refresh.
          dropOptimisticMessage();
          turnMayBeCounted = true;
          toast.error(
            'Không thể xác nhận câu hỏi đã gửi chưa. Kiểm tra lại lịch sử trước khi gửi lại.',
          );
        }
      }
    } finally {
      if (accepted || turnMayBeCounted) options.onTurnComplete?.();
      // The new conversation already reset this state; writing it again would
      // clear a stream that was started there in the meantime. Comparing the
      // controller (not the conversation) survives A -> B -> A.
      if (abortControllerRef.current === controller) {
        setStreamingContent('');
        setIsSending(false);
        abortControllerRef.current = null;
      }
    }
    return accepted;
  }

  function stop() {
    abortControllerRef.current?.abort();
  }

  // The page restores a rejected question only into the conversation it was
  // typed in, never into whichever one the user switched to meanwhile.
  function isActiveConversation(id: string) {
    return activeConversationIdRef.current === id;
  }

  // A confirm/cancel can outlive a conversation switch; only clear the action
  // it was actually started for, never whatever the new conversation holds.
  function clearPendingAction(actionId: string) {
    setPendingAction((current) => (current?.id === actionId ? null : current));
  }

  // The backend answers CONFLICT for an action that is expired, already
  // confirmed, already cancelled, or bound to another draft; none of those can
  // be resolved from this UI anymore, so stop blocking the composer on it.
  function dropIfResolvedElsewhere(error: unknown, actionId: string): boolean {
    if (getApiErrorCode(error) !== 'CONFLICT') return false;
    clearPendingAction(actionId);
    toast.info(PENDING_ACTION_STALE_MESSAGE);
    return true;
  }

  async function resolvePendingAction(kind: 'confirm' | 'cancel') {
    if (!pendingAction || busyAction !== null) return;
    const actionId = pendingAction.id;
    const requestId = ++pendingActionRequestRef.current;
    setBusyAction(kind);
    try {
      if (kind === 'confirm') {
        await confirmCopilotAction(actionId);
        clearPendingAction(actionId);
        toast.success('Đã gửi email nhắc thanh toán.');
      } else {
        await cancelCopilotAction(actionId);
        clearPendingAction(actionId);
      }
    } catch (error) {
      if (!dropIfResolvedElsewhere(error, actionId)) {
        toast.error(
          kind === 'confirm'
            ? 'Không thể gửi email nhắc thanh toán.'
            : 'Không thể hủy đề xuất gửi email.',
        );
      }
    } finally {
      if (pendingActionRequestRef.current === requestId) setBusyAction(null);
    }
  }

  async function confirm() {
    await resolvePendingAction('confirm');
  }

  async function cancel() {
    await resolvePendingAction('cancel');
  }

  return {
    messages,
    pendingAction,
    send,
    stop,
    isSending,
    streamingContent,
    confirm,
    cancel,
    isActiveConversation,
    busy,
    busyAction,
    blockedByPendingAction,
    isLoadingHistory,
    quotaExceededMessage,
  };
}
