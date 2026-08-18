import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL, apiRequest, authTokenManager } from '@/lib/api-client';
import type {
  CopilotConversationsPage,
  CopilotMessage,
  CopilotPendingAction,
} from '../types';

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

export function listCopilotConversations(
  page = 1,
  limit = 20,
): Promise<CopilotConversationsPage> {
  return apiRequest<CopilotConversationsPage>({
    url: '/api/v1/copilot/conversations',
    method: 'GET',
    params: { page, limit },
  });
}

export function getCopilotConversationMessages(
  conversationId: string,
): Promise<{ items: CopilotMessage[] }> {
  return apiRequest<{ items: CopilotMessage[] }>({
    url: `/api/v1/copilot/conversations/${conversationId}/messages`,
    method: 'GET',
  });
}

export type CopilotStreamEvent =
  | { type: 'status'; text: string }
  | { type: 'delta'; text: string }
  | {
      type: 'done';
      data: {
        message: CopilotMessage;
        pendingAction: CopilotPendingAction | null;
      };
    }
  | { type: 'error'; errorCode: string; message: string };

export async function streamCopilotMessage(
  conversationId: string,
  content: string,
  onEvent: (event: CopilotStreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const token = await authTokenManager.getValidAccessToken();
  const response = await fetch(
    `${API_BASE_URL}/api/v1/copilot/conversations/${conversationId}/messages/stream`,
    {
      method: 'POST',
      credentials: 'include',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ content }),
    },
  );
  if (!response.ok || !response.body) {
    throw new Error(`Copilot stream failed with status ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separatorIndex = buffer.indexOf('\n\n');
    while (separatorIndex !== -1) {
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const lines = rawEvent.split('\n');
      const eventLine = lines.find((line) => line.startsWith('event: '));
      const dataLine = lines.find((line) => line.startsWith('data: '));
      if (eventLine && dataLine) {
        const type = eventLine.slice('event: '.length);
        const data: unknown = JSON.parse(dataLine.slice('data: '.length));
        onEvent(toCopilotStreamEvent(type, data));
      }
      separatorIndex = buffer.indexOf('\n\n');
    }
  }
}

function toCopilotStreamEvent(type: string, data: unknown): CopilotStreamEvent {
  if (type === 'status' || type === 'delta') {
    return { type, text: (data as { text: string }).text };
  }
  if (type === 'done') {
    return {
      type: 'done',
      data: data as {
        message: CopilotMessage;
        pendingAction: CopilotPendingAction | null;
      },
    };
  }
  const errorPayload = data as { errorCode: string; message: string };
  return {
    type: 'error',
    errorCode: errorPayload.errorCode,
    message: errorPayload.message,
  };
}
