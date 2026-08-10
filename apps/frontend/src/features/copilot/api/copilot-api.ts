import { apiRequest } from '@/lib/api-client';
import type { CopilotMessage, CopilotPendingAction } from '../types';

export interface CopilotTurnResult {
  message: CopilotMessage;
  pendingAction: CopilotPendingAction | null;
}

export function sendCopilotMessage(
  conversationId: string,
  content: string,
): Promise<CopilotTurnResult> {
  return apiRequest<CopilotTurnResult>({
    url: `/api/v1/copilot/conversations/${conversationId}/messages`,
    method: 'POST',
    data: { content },
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export function confirmCopilotAction(
  actionId: string,
): Promise<{ reminderExecutionId: string }> {
  return apiRequest<{ reminderExecutionId: string }>({
    url: `/api/v1/copilot/actions/${actionId}/confirm`,
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export function cancelCopilotAction(
  actionId: string,
): Promise<CopilotPendingAction> {
  return apiRequest<CopilotPendingAction>({
    url: `/api/v1/copilot/actions/${actionId}/cancel`,
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}
