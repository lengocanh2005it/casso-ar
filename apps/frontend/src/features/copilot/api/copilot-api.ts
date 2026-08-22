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

export class CopilotStreamRequestError extends Error {
  errorCode?: string;

  constructor(message: string, errorCode?: string) {
    super(message);
    this.name = 'CopilotStreamRequestError';
    this.errorCode = errorCode;
  }
}

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
    const body: unknown = await response.json().catch(() => null);
    const errorCode =
      isRecord(body) && typeof body.errorCode === 'string'
        ? body.errorCode
        : undefined;
    const message =
      isRecord(body) && typeof body.message === 'string'
        ? body.message
        : `Copilot stream failed with status ${response.status}`;
    throw new CopilotStreamRequestError(message, errorCode);
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
        const rawData: unknown = JSON.parse(dataLine.slice('data: '.length));
        const event = toCopilotStreamEvent(type, rawData);
        if (event) onEvent(event);
      }
      separatorIndex = buffer.indexOf('\n\n');
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// SSE chunks cross a network boundary — a truncated or unexpected payload
// here should be dropped, not forwarded as a garbage event or thrown as an
// unhandled exception that would kill the whole stream-reading loop.
function toCopilotStreamEvent(
  type: string,
  data: unknown,
): CopilotStreamEvent | null {
  if (!isRecord(data)) return null;

  if (type === 'status' || type === 'delta') {
    return typeof data.text === 'string' ? { type, text: data.text } : null;
  }
  if (type === 'done') {
    return isRecord(data.message) && 'id' in data.message
      ? {
          type: 'done',
          data: data as {
            message: CopilotMessage;
            pendingAction: CopilotPendingAction | null;
          },
        }
      : null;
  }
  if (type === 'error') {
    return typeof data.errorCode === 'string' &&
      typeof data.message === 'string'
      ? { type: 'error', errorCode: data.errorCode, message: data.message }
      : null;
  }
  return null;
}
