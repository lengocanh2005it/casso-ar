import { apiRequest } from '@/lib/api-client';
import type {
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
