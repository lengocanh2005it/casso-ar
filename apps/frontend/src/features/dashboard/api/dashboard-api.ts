import { apiRequest } from '@/lib/api-client';
import type { OrganizationActivityPage } from '../types';

export function fetchOrganizationActivity(
  page = 1,
): Promise<OrganizationActivityPage> {
  return apiRequest<OrganizationActivityPage>({
    url: '/api/v1/activity',
    method: 'GET',
    params: { page, limit: 10 },
  });
}
