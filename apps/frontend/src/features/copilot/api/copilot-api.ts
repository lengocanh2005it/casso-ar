import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import type { CopilotMessage, CopilotPendingAction } from '../types';

export interface CopilotTurnResult {
  message: CopilotMessage;
  pendingAction: CopilotPendingAction | null;
}

export interface CopilotUsage {
  turnsUsed: number;
  turnsLimit: number;
  periodStart: string;
  periodEnd: string;
}

export function fetchCopilotUsage(): Promise<CopilotUsage> {
  return apiRequest<CopilotUsage>({
    url: '/api/v1/copilot/usage',
    method: 'GET',
  });
}

export function useCopilotUsage() {
  return useQuery({
    queryKey: ['copilot-usage'],
    queryFn: fetchCopilotUsage,
  });
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
