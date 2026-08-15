import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AdminMemberStatusFilter,
  blockOrganizationMember,
  getAdminOrganization,
  getAiUsage,
  getAiUsageTrend,
  listOrganizationMembers,
  listOrganizations,
  lockOrganization,
  unblockOrganizationMember,
  unlockOrganization,
} from './admin-api';

const adminOrganizationsQueryKey = ['admin-organizations'] as const;
const adminOrganizationMembersQueryKey = [
  'admin-organization',
  'members',
] as const;

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

export function useAdminOrganization(organizationId: string) {
  return useQuery({
    queryKey: ['admin-organization', organizationId],
    queryFn: () => getAdminOrganization(organizationId),
    enabled: Boolean(organizationId),
  });
}

export function useOrganizationMembers(
  organizationId: string,
  page: number,
  limit: number,
  status: AdminMemberStatusFilter,
  search: string,
) {
  return useQuery({
    queryKey: [
      ...adminOrganizationMembersQueryKey,
      organizationId,
      page,
      limit,
      status,
      search,
    ],
    queryFn: () =>
      listOrganizationMembers(organizationId, { page, limit, status, search }),
    enabled: Boolean(organizationId),
  });
}

export function useBlockOrganizationMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      organizationId,
      userId,
      action,
    }: {
      organizationId: string;
      userId: string;
      action: 'block' | 'unblock';
    }) =>
      action === 'block'
        ? blockOrganizationMember(organizationId, userId)
        : unblockOrganizationMember(organizationId, userId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: adminOrganizationMembersQueryKey,
      }),
  });
}
