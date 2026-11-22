import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { CopilotDraftStatus } from '../types';
import { confirmCopilotAction } from './copilot-api';
import {
  deleteCopilotDraft,
  fetchCopilotDrafts,
  reopenCopilotDraft,
  updateCopilotDraft,
} from './copilot-drafts-api';

export const COPILOT_DRAFTS_PAGE_SIZE = 20;

export function useCopilotDrafts(page = 1, status?: CopilotDraftStatus) {
  return useQuery({
    queryKey: ['copilot-drafts', page, status],
    queryFn: () => fetchCopilotDrafts(page, COPILOT_DRAFTS_PAGE_SIZE, status),
    // Keep the current page on screen while the next one loads.
    placeholderData: keepPreviousData,
  });
}

export function useReopenCopilotDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reopenCopilotDraft,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['copilot-drafts'] });
    },
  });
}

export function useConfirmCopilotDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: confirmCopilotAction,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['copilot-drafts'] });
    },
  });
}

export function useUpdateCopilotDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { subject?: string; bodyHtml?: string };
    }) => updateCopilotDraft(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['copilot-drafts'] });
    },
  });
}

export function useDeleteCopilotDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCopilotDraft,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['copilot-drafts'] });
    },
  });
}
