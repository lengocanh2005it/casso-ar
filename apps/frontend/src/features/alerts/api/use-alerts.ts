import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteAlert,
  deleteAllAlerts,
  fetchAlerts,
  markAlertRead,
  markAllAlertsRead,
} from './alerts-api';

export function useAlerts(page = 1, unreadOnly = false, enabled = true) {
  return useQuery({
    queryKey: ['alerts', page, unreadOnly],
    queryFn: () => fetchAlerts(page, 20, unreadOnly),
    enabled,
  });
}

function useAlertsMutation<TInput>(
  mutationFn: (input: TInput) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export function useMarkAlertRead() {
  return useAlertsMutation<string>(markAlertRead);
}

export function useMarkAllAlertsRead() {
  return useAlertsMutation<void>(markAllAlertsRead);
}

export function useDeleteAlert() {
  return useAlertsMutation<string>(deleteAlert);
}

export function useDeleteAllAlerts() {
  return useAlertsMutation<void>(deleteAllAlerts);
}
