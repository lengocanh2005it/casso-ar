import type { MatchingCandidate } from '@/features/transactions/types';
import { apiRequest } from '@/lib/api-client';
import type { PendingReviewItem } from '../types';

export interface PendingReviewPage {
  items: PendingReviewItem[];
  total: number;
  page: number;
  limit: number;
}

export function fetchPendingReview(page: number): Promise<PendingReviewPage> {
  return apiRequest<PendingReviewPage>({
    url: '/api/v1/bank-transactions/unmatched',
    method: 'GET',
    params: { page, limit: 20 },
  });
}

export function fetchCandidates(
  bankTransactionId: string,
): Promise<MatchingCandidate[]> {
  return apiRequest<MatchingCandidate[]>({
    url: `/api/v1/bank-transactions/${bankTransactionId}/candidates`,
    method: 'GET',
  });
}

function postWithIdempotency<T>(url: string, data?: unknown): Promise<T> {
  return apiRequest<T>({
    url,
    method: 'POST',
    data,
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export function splitMatch(
  bankTransactionId: string,
  allocations: Array<{ receivableId: string; amount: number }>,
  version: number,
): Promise<{ id: string }> {
  return postWithIdempotency<{ id: string }>(
    `/api/v1/bank-transactions/${bankTransactionId}/match`,
    { allocations, version },
  );
}

export function skipTransaction(
  bankTransactionId: string,
): Promise<{ id: string }> {
  return postWithIdempotency<{ id: string }>(
    `/api/v1/bank-transactions/${bankTransactionId}/skip`,
  );
}

export function markPrepaid(
  bankTransactionId: string,
  customerId: string,
): Promise<{ id: string }> {
  return postWithIdempotency<{ id: string }>(
    `/api/v1/bank-transactions/${bankTransactionId}/mark-prepaid`,
    { customerId },
  );
}
