import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getResponseErrorMessage } from '@/features/settings/api/settings-api';
import type { WebhookInboxListQuery } from '../types';
import { fetchWebhookInbox, reprocessWebhookInbox } from './webhook-inbox-api';

export function useWebhookInbox(query: WebhookInboxListQuery) {
  const { page, limit, ...filters } = query;
  return useQuery({
    queryKey: ['webhook-inbox', filters, page, limit],
    queryFn: () => fetchWebhookInbox(filters, page, limit),
  });
}

export function useReprocessWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reprocessWebhookInbox(id),
    onSuccess: () => {
      toast.success('Đã xử lý lại webhook.');
      void queryClient.invalidateQueries({ queryKey: ['webhook-inbox'] });
    },
    onError: (error) =>
      toast.error(
        getResponseErrorMessage(error, 'Không thể xử lý lại webhook.'),
      ),
  });
}
