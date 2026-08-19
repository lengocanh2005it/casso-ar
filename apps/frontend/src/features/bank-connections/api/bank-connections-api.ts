import { apiRequest, postWithIdempotency } from '@/lib/api-client';
import type {
  BankConnectionList,
  CasIdExchangeInput,
  CasIdInitiation,
} from '../types';

export function fetchBankConnections(): Promise<BankConnectionList> {
  return apiRequest<BankConnectionList>({
    url: '/api/v1/bank-connections?page=1&limit=100',
    method: 'GET',
  });
}

export function connectCasId(): Promise<CasIdInitiation> {
  return postWithIdempotency<CasIdInitiation>(
    '/api/v1/bank-connections/cas-id/initiate',
    {},
  );
}

export function exchangeCasId(
  sessionId: string,
  input: CasIdExchangeInput,
): Promise<{ connectionId: string; status: string }> {
  return postWithIdempotency(
    `/api/v1/bank-connections/cas-id/sessions/${sessionId}/exchange`,
    input,
  );
}

export function disconnectConnection(
  id: string,
): Promise<{ success: boolean }> {
  return postWithIdempotency(`/api/v1/bank-connections/${id}/disconnect`);
}
