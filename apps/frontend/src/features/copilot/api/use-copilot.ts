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
  // True from the send until the first delta or any terminal event. The log is
  // aria-busy while sending, so the wait must be announced from outside it.
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  // Scoped to a proposal: a confirm still running for a proposal that has
  // since been replaced must not label or block the new one.
  const [busyState, setBusyState] = useState<{
    actionId: string;
    kind: 'confirm' | 'cancel';
  } | null>(null);
  const busyAction =
    busyState && busyState.actionId === pendingAction?.id
      ? busyState.kind
      : null;
  const busy = busyAction !== null;
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [quotaExceededMessage, setQuotaExceededMessage] = useState<
    string | null
  >(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // The history read needs a live signal even when the send was stopped: the
  // POST's controller is already aborted by then.
  const reconcileControllerRef = useRef<AbortController | null>(null);
  const activeConversationIdRef = useRef(conversationId);
  // A send can outrun the mount load, and the load then drops its page. The
  // reconcile must know whether the local list really is the history, or an
  // older copy of the question would confirm a send that never landed.
  const historyBaselineAppliedRef = useRef(false);
  // The load decides from the real list, and a state updater must stay pure,
  // so the list is mirrored here.
  const messagesRef = useRef<CopilotMessage[]>([]);
  messagesRef.current = messages;
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
    reconcileControllerRef.current?.abort();
    reconcileControllerRef.current = null;
    pendingActionRequestRef.current += 1;
    historyBaselineAppliedRef.current = false;
    setMessages([]);
    setPendingAction(null);
    setBusyState(null);
    setIsSending(false);
    setIsWaitingForResponse(false);
    setStreamingContent('');
    setIsLoadingHistory(true);
    setQuotaExceededMessage(null);

    getCopilotConversationMessages(conversationId)
      .then((page) => {
        if (cancelled) return;
        // A live send owns the list (its bubble may still be queued, not
        // committed): its page is stale, so drop it and leave the baseline
        // unset. An empty list — including one a rejected send just cleared —
        // takes the page.
        if (messagesRef.current.length > 0 || abortControllerRef.current) {
          return;
        }
        // The flag and the ref describe the same transcript: a send that starts
        // before React commits this update must still count these messages.
        historyBaselineAppliedRef.current = true;
        messagesRef.current = page.items;
        setMessages(page.items);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // No history at all is a baseline: there is nothing older to confuse
        // the reconcile with.
        if (getApiErrorCode(error) === 'NOT_FOUND') {
          historyBaselineAppliedRef.current = true;
          return;
        }
        toast.error('Không thể tải lịch sử cuộc trò chuyện.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingHistory(false);
      });

    return () => {
      cancelled = true;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      reconcileControllerRef.current?.abort();
      reconcileControllerRef.current = null;
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
    // Local ids do not survive a round trip: a persisted question comes back
    // under the server's id. Counting the copies of this exact text does, and
    // it is read before the optimistic bubble exists. The ref, not the render
    // closure, so it always matches what the history baseline flag describes.
    const knownMatching = messagesRef.current.filter(
      (message) =>
        message.role === 'USER' && message.content.trim() === trimmed,
    ).length;
    const historyWasLoaded = historyBaselineAppliedRef.current;

    setIsSending(true);
    setIsWaitingForResponse(true);
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

    // The backend persists the question before it flushes the SSE headers and
    // does not cancel that write when the browser hangs up, so the POST can
    // still commit after this read. Only presence in the history proves
    // anything: absence is always "unknown", never "lost". Copies are counted
    // by exact text because client ids do not survive the round trip, the
    // clocks can disagree, and the user may repeat an earlier question word
    // for word.
    const reconcileOutcome = async (): Promise<{
      outcome: 'persisted' | 'unknown';
      items: CopilotMessage[] | null;
    }> => {
      // Its own controller: this read also runs after a Stop, when the POST's
      // signal is already aborted and would reject before dispatch.
      const reconcileController = new AbortController();
      reconcileControllerRef.current?.abort();
      reconcileControllerRef.current = reconcileController;
      try {
        const page = await getCopilotConversationMessages(
          sendConversationId,
          reconcileController.signal,
        );
        const fetchedMatching = page.items.filter(
          (message) =>
            message.role === 'USER' && message.content.trim() === trimmed,
        ).length;
        // Only an extra copy of this exact text proves this send landed. A
        // capped page can hide older ones, a repeat adds nothing new, and the
        // local list may still be loading, so every other case is unknown.
        if (historyWasLoaded && fetchedMatching > knownMatching) {
          return { outcome: 'persisted', items: page.items };
        }
        return { outcome: 'unknown', items: null };
      } catch {
        return { outcome: 'unknown', items: null };
      } finally {
        if (reconcileControllerRef.current === reconcileController) {
          reconcileControllerRef.current = null;
        }
      }
    };

    // Shared by every failure that cannot prove the write never happened: a
    // transport drop, a 5xx that may follow a committed write, a Stop before
    // the response headers.
    const handleUnconfirmedSend = async () => {
      const { outcome, items } = await reconcileOutcome();
      // The read can outlive the conversation it was started for: a switch
      // aborts it, and every write and every toast below belongs to the old one.
      const owns =
        abortControllerRef.current === controller && isCurrentConversation();
      if (outcome === 'persisted') {
        // The turn was taken: the fetched page replaces the optimistic bubble
        // with the real message, so nothing is duplicated.
        accepted = true;
        if (owns && items) setMessages(items);
        if (owns) {
          toast.error(
            'Mất kết nối khi gửi. Câu hỏi đã được ghi nhận, hãy mở lại cuộc trò chuyện để xem phản hồi.',
          );
        }
      } else {
        // Unknown: the page hands the question back, but the write may still
        // commit, so usage and the list must still refresh.
        if (owns) dropOptimisticMessage();
        turnMayBeCounted = true;
        if (owns) {
          toast.error(
            'Không thể xác nhận câu hỏi đã gửi chưa. Kiểm tra lại lịch sử trước khi gửi lại.',
          );
        }
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
            setIsWaitingForResponse(false);
            streamedText += event.text;
            setStreamingContent((current) => current + event.text);
          } else if (event.type === 'done') {
            setIsWaitingForResponse(false);
            answerCommitted = true;
            setMessages((current) => [...current, event.data.message]);
            setPendingAction(event.data.pendingAction ?? null);
          } else if (event.type === 'error') {
            // The turn failed after it started answering: keep what the user
            // already read instead of dropping it on the floor.
            setIsWaitingForResponse(false);
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
        if (!isCurrentConversation()) {
          // A switch aborts the same way, and the server may have counted the
          // turn before the first byte: refresh usage without touching B.
          accepted = true;
        } else if (accepted) {
          // A Stop after the response headers: the turn was counted.
          appendPartialAnswer();
        } else if (abortControllerRef.current === controller) {
          // A Stop can land while the token lookup is still running, before
          // the POST is even dispatched: the write is not proven, so ask the
          // history instead of assuming the server took it. No ownership means
          // the hook unmounted, so no read may outlive it.
          await handleUnconfirmedSend();
        } else {
          // Unmounted mid-send: the turn may still have been counted.
          accepted = true;
        }
      } else if (accepted) {
        // The 2xx response arrived, so the server already persisted and counted
        // the turn: it resolves true and the question stays sent, with whatever
        // text was streamed kept on screen.
        if (isCurrentConversation()) {
          appendPartialAnswer();
          toast.error(
            streamedText
              ? 'Kết nối với Copilot bị gián đoạn.'
              : 'Không thể gửi câu hỏi cho Copilot.',
          );
        }
      } else if (
        error instanceof CopilotStreamRequestError &&
        error.status < 500
      ) {
        // A 4xx proves the write never reached the database. A 5xx does not:
        // the row can be committed before a later step fails.
        dropOptimisticMessage();
        // The rejection belongs to a conversation the user may have left.
        if (isCurrentConversation()) {
          if (error.errorCode === 'PLAN_LIMIT_EXCEEDED') {
            setQuotaExceededMessage(error.message);
            toast.error(error.message);
          } else {
            toast.error('Không thể gửi câu hỏi cho Copilot.');
          }
        }
      } else {
        await handleUnconfirmedSend();
      }
    } finally {
      if (accepted || turnMayBeCounted) options.onTurnComplete?.();
      // The new conversation already reset this state; writing it again would
      // clear a stream that was started there in the meantime. Comparing the
      // controller (not the conversation) survives A -> B -> A.
      if (abortControllerRef.current === controller) {
        setStreamingContent('');
        setIsWaitingForResponse(false);
        setIsSending(false);
        abortControllerRef.current = null;
      }
    }
    return accepted;
  }

  function stop() {
    abortControllerRef.current?.abort();
    // A second Stop must also cut a history read that is still running.
    reconcileControllerRef.current?.abort();
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
    setBusyState({ actionId, kind });
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
      if (pendingActionRequestRef.current === requestId) setBusyState(null);
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
    isWaitingForResponse,
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
