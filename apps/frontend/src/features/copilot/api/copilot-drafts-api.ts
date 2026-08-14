import { apiRequest } from '@/lib/api-client';
import type {
  CopilotDraft,
  CopilotDraftStatus,
  CopilotDraftsPage,
  CopilotPendingAction,
} from '../types';

export function fetchCopilotDrafts(
  page: number,
  limit: number,
  status?: CopilotDraftStatus,
): Promise<CopilotDraftsPage> {
  return apiRequest<CopilotDraftsPage>({
    url: '/api/v1/copilot/drafts',
    method: 'GET',
    params: { page, limit, ...(status ? { status } : {}) },
  });
}

export function reopenCopilotDraft(
  id: string,
): Promise<{ conversationId: string; pendingAction: CopilotPendingAction }> {
  return apiRequest<{
    conversationId: string;
    pendingAction: CopilotPendingAction;
  }>({
    url: `/api/v1/copilot/drafts/${id}/reopen`,
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export function updateCopilotDraft(
  id: string,
  input: { subject?: string; bodyHtml?: string },
): Promise<CopilotDraft> {
  return apiRequest<CopilotDraft>({
    url: `/api/v1/copilot/drafts/${id}`,
    method: 'PATCH',
    data: input,
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export function deleteCopilotDraft(id: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    url: `/api/v1/copilot/drafts/${id}`,
    method: 'DELETE',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}
