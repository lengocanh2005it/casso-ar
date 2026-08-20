import { apiRequest, postWithIdempotency } from '@/lib/api-client';
import type {
  BankConnection,
  BankConnectionList,
  ConnectCassoFlowInput,
} from '../types';

export function fetchBankConnections(): Promise<BankConnectionList> {
  return apiRequest<BankConnectionList>({
    url: '/api/v1/bank-connections?page=1&limit=100',
    method: 'GET',
  });
}

export function connectCassoFlow(
  input: ConnectCassoFlowInput,
): Promise<BankConnection> {
  return postWithIdempotency<BankConnection>(
    '/api/v1/bank-connections/casso-flow/connect',
    input,
  );
}

export function disconnectConnection(
  id: string,
): Promise<{ success: boolean }> {
  return postWithIdempotency(`/api/v1/bank-connections/${id}/disconnect`);
}
