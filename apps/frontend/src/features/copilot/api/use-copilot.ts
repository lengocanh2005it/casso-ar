import { useCallback, useEffect, useRef, useState } from 'react';
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
const PENDING_ACTION_EXPIRED_MESSAGE = 'Đề xuất gửi email đã hết hạn.';

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
  const [busy, setBusy] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [quotaExceededMessage, setQuotaExceededMessage] = useState<
    string | null
  >(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const blockedByPendingAction =
    pendingAction !== null && canResolvePendingAction;

  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setPendingAction(null);
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
    };
  }, [conversationId]);

  // An expired proposal is refused by the backend, so blocking the composer on
  // it would trap the input: drop it at the same moment the server would.
  useEffect(() => {
    if (!pendingAction) return;

    const expiresIn =
      new Date(pendingAction.createdAt).getTime() +
      PENDING_ACTION_TTL_MS -
      Date.now();
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
    // The backend persists (and counts) the user's message before it writes any
    // SSE header, so a 2xx response - and every way that response can go wrong
    // afterwards (abort, dropped stream) - still consumed a turn. Only a
    // non-2xx CopilotStreamRequestError proves the write never happened, so
    // assume counted and let that one branch opt out.
    let turnCounted = true;

    try {
      await streamCopilotMessage(
        conversationId,
        trimmed,
        (event) => {
          if (event.type === 'delta') {
            streamedText += event.text;
            setStreamingContent((current) => current + event.text);
          } else if (event.type === 'done') {
            setMessages((current) => [...current, event.data.message]);
            setPendingAction(event.data.pendingAction ?? null);
          } else if (event.type === 'error') {
            toast.error(event.message);
          }
        },
        controller.signal,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        if (streamedText) {
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
        }
      } else if (error instanceof CopilotStreamRequestError) {
        // Rejected with a non-2xx status: the write never reached the database,
        // so the turn was not counted.
        turnCounted = false;

        if (error.errorCode === 'PLAN_LIMIT_EXCEEDED') {
          // The quota check runs before the write — drop the optimistic bubble
          // so the chat doesn't show a question that was never actually sent.
          setMessages((current) =>
            current.filter((message) => message.id !== optimisticMessageId),
          );
          setQuotaExceededMessage(error.message);
          toast.error(error.message);
        } else {
          toast.error('Không thể gửi câu hỏi cho Copilot.');
        }
      } else {
        // A network failure happens before any response, so the turn was not
        // accepted either — the page must hand the question back to the user.
        turnCounted = false;
        toast.error('Không thể gửi câu hỏi cho Copilot.');
      }
    } finally {
      if (turnCounted) options.onTurnComplete?.();
      setStreamingContent('');
      setIsSending(false);
      abortControllerRef.current = null;
    }
    return turnCounted;
  }

  function stop() {
    abortControllerRef.current?.abort();
  }

  // The backend answers CONFLICT for an action that is expired, already
  // confirmed, or already cancelled; none of those can be resolved from this
  // UI anymore, so stop blocking the composer on it.
  const dropIfResolvedElsewhere = useCallback((error: unknown): boolean => {
    if (getApiErrorCode(error) !== 'CONFLICT') return false;
    setPendingAction(null);
    toast.info(PENDING_ACTION_EXPIRED_MESSAGE);
    return true;
  }, []);

  async function confirm() {
    if (!pendingAction || busy) return;
    setBusy(true);
    try {
      await confirmCopilotAction(pendingAction.id);
      setPendingAction(null);
      toast.success('Đã gửi email nhắc thanh toán.');
    } catch (error) {
      if (!dropIfResolvedElsewhere(error)) {
        toast.error('Không thể gửi email nhắc thanh toán.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!pendingAction || busy) return;
    setBusy(true);
    try {
      await cancelCopilotAction(pendingAction.id);
      setPendingAction(null);
    } catch (error) {
      if (!dropIfResolvedElsewhere(error)) {
        toast.error('Không thể hủy đề xuất gửi email.');
      }
    } finally {
      setBusy(false);
    }
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
    busy,
    blockedByPendingAction,
    isLoadingHistory,
    quotaExceededMessage,
  };
}
