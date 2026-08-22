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

  async function send(content: string) {
    const trimmed = content.trim();
    if (
      !trimmed ||
      isSending ||
      blockedByPendingAction ||
      quotaExceededMessage !== null
    ) {
      return;
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
            setPendingAction(event.data.pendingAction);
            options.onTurnComplete?.();
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
      } else if (
        error instanceof CopilotStreamRequestError &&
        error.errorCode === 'PLAN_LIMIT_EXCEEDED'
      ) {
        // The message was never persisted (the quota check runs before the
        // write) — drop the optimistic bubble so the chat doesn't show a
        // question that was never actually sent.
        setMessages((current) =>
          current.filter((message) => message.id !== optimisticMessageId),
        );
        setQuotaExceededMessage(error.message);
        toast.error(error.message);
      } else {
        toast.error('Không thể gửi câu hỏi cho Copilot.');
      }
    } finally {
      setStreamingContent('');
      setIsSending(false);
      abortControllerRef.current = null;
    }
  }

  function stop() {
    abortControllerRef.current?.abort();
  }

  async function confirm() {
    if (!pendingAction || busy) return;
    setBusy(true);
    try {
      await confirmCopilotAction(pendingAction.id);
      setPendingAction(null);
      toast.success('Đã gửi email nhắc thanh toán.');
    } catch {
      toast.error('Không thể gửi email nhắc thanh toán.');
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
    } catch {
      toast.error('Không thể hủy đề xuất gửi email.');
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
