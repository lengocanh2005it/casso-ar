import type { PlanId } from '@casso-ledger/shared-types';
import { apiRequest } from '@/lib/api-client';

export interface PlanCatalogEntry {
  planId: PlanId;
  priceVnd: number;
  receivableMonthlyLimit: number;
  bankConnectionLimit: number;
  copilotChatMonthlyLimit: number;
}

export function fetchPlans(): Promise<PlanCatalogEntry[]> {
  return apiRequest<PlanCatalogEntry[]>({
    url: '/api/v1/plans',
    method: 'GET',
  });
}
