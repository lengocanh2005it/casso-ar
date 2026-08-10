import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type { CopilotMessage, CopilotPendingAction } from '../types';
import {
  cancelCopilotAction,
  confirmCopilotAction,
  sendCopilotMessage,
} from './copilot-api';

export function useCopilotChat() {
  const conversationId = useRef(crypto.randomUUID()).current;
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [pendingAction, setPendingAction] =
    useState<CopilotPendingAction | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send(content: string) {
    const trimmed = content.trim();
    if (!trimmed || isSending || pendingAction) return;

    setIsSending(true);
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: 'USER',
        content: trimmed,
        createdAt: new Date().toISOString(),
      },
    ]);

    try {
      const result = await sendCopilotMessage(conversationId, trimmed);
      setMessages((current) => [...current, result.message]);
      setPendingAction(result.pendingAction);
    } catch {
      toast.error('Không thể gửi câu hỏi cho Copilot.');
    } finally {
      setIsSending(false);
    }
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

  return { messages, pendingAction, send, isSending, confirm, cancel, busy };
}
