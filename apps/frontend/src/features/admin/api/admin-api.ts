import { apiRequest, authTokenManager } from '@/lib/api-client';

export interface OrganizationListItem {
  id: string;
  name: string;
  status: 'ACTIVE' | 'LOCKED';
  createdAt: string;
}

export interface AiUsageAggregateItem {
  organizationId: string;
  organizationName: string;
  model: string;
  requestCount: number;
  totalTokens: number;
  errorCount: number;
}

export interface AiUsageTrendPoint {
  date: string;
  requestCount: number;
  totalTokens: number;
}

export async function adminLogin(
  email: string,
  password: string,
): Promise<void> {
  const result = await apiRequest<{ accessToken: string }>({
    url: '/api/v1/auth/login',
    method: 'POST',
    data: { email, password },
  });
  authTokenManager.setAccessToken(result.accessToken);
}

export function listOrganizations(
  page: number,
  limit: number,
): Promise<{
  items: OrganizationListItem[];
  total: number;
  page: number;
  limit: number;
}> {
  return apiRequest({
    url: '/api/v1/admin/organizations',
    method: 'GET',
    params: { page, limit },
  });
}

export function lockOrganization(id: string): Promise<{ status: string }> {
  return apiRequest({
    url: `/api/v1/admin/organizations/${id}/lock`,
    method: 'POST',
  });
}

export function unlockOrganization(id: string): Promise<{ status: string }> {
  return apiRequest({
    url: `/api/v1/admin/organizations/${id}/unlock`,
    method: 'POST',
  });
}

export function getAiUsage(
  from: string,
  to: string,
): Promise<{ items: AiUsageAggregateItem[] }> {
  return apiRequest({
    url: '/api/v1/admin/ai-usage',
    method: 'GET',
    params: { from, to },
  });
}

export function getAiUsageTrend(
  from: string,
  to: string,
): Promise<{ items: AiUsageTrendPoint[] }> {
  return apiRequest({
    url: '/api/v1/admin/ai-usage/trend',
    method: 'GET',
    params: { from, to },
  });
}
