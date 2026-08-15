import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getAiUsage,
  getAiUsageTrend,
  listOrganizations,
  lockOrganization,
  unlockOrganization,
} from './admin-api';

const adminOrganizationsQueryKey = ['admin-organizations'] as const;

export function useAdminOrganizations(page: number, limit: number) {
  return useQuery({
    queryKey: [...adminOrganizationsQueryKey, page, limit],
    queryFn: () => listOrganizations(page, limit),
  });
}

export function useAdminOrganizationStatus() {
  return useAdminOrganizations(1, 100);
}

export function useAdminAiUsage(
  from: string,
  to: string,
  enabled = Boolean(from && to),
) {
  return useQuery({
    queryKey: ['admin-ai-usage', from, to],
    queryFn: () => getAiUsage(from, to),
    enabled,
  });
}

export function useAdminAiUsageTrend(from: string, to: string) {
  return useQuery({
    queryKey: ['admin-ai-usage-trend', from, to],
    queryFn: () => getAiUsageTrend(from, to),
    enabled: Boolean(from && to),
  });
}

export function useToggleOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'lock' | 'unlock' }) =>
      action === 'lock' ? lockOrganization(id) : unlockOrganization(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: adminOrganizationsQueryKey }),
  });
}
