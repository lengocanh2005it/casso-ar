import { apiRequest, postWithIdempotency } from '@/lib/api-client';
import type {
  BankConnectionList,
  ConfirmCassoFlowInput,
  ConnectCassoFlowResult,
  ConnectionAuditEventList,
  PreviewCassoFlowAccountsResult,
  PreviewCassoFlowAuthorizationRotationResult,
  RevealCassoFlowApiKeyInput,
  RevealCassoFlowApiKeyResult,
  RotateCassoFlowAuthorizationResult,
  RotateCassoFlowInput,
} from '../types';

export function fetchBankConnections(): Promise<BankConnectionList> {
  return apiRequest<BankConnectionList>({
    url: '/api/v1/bank-connections?page=1&limit=100',
    method: 'GET',
  });
}

export function previewCassoFlowAccounts(input: {
  apiKey: string;
}): Promise<PreviewCassoFlowAccountsResult> {
  return apiRequest<PreviewCassoFlowAccountsResult>({
    url: '/api/v1/bank-connections/casso-flow/preview',
    method: 'POST',
    data: input,
  });
}

export function confirmCassoFlow(
  input: ConfirmCassoFlowInput,
): Promise<ConnectCassoFlowResult> {
  return postWithIdempotency<ConnectCassoFlowResult>(
    '/api/v1/bank-connections/casso-flow/confirm',
    input,
  );
}

export function previewCassoFlowAuthorizationRotation(
  authorizationId: string,
  input: { apiKey: string },
): Promise<PreviewCassoFlowAuthorizationRotationResult> {
  return apiRequest<PreviewCassoFlowAuthorizationRotationResult>({
    url: `/api/v1/bank-connections/authorizations/${authorizationId}/casso-flow/preview`,
    method: 'POST',
    data: input,
  });
}

export function rotateCassoFlowAuthorization(
  authorizationId: string,
  input: RotateCassoFlowInput,
): Promise<RotateCassoFlowAuthorizationResult> {
  return postWithIdempotency<RotateCassoFlowAuthorizationResult>(
    `/api/v1/bank-connections/authorizations/${authorizationId}/casso-flow/confirm`,
    input,
  );
}

export function revealCassoFlowApiKey(
  authorizationId: string,
  input: RevealCassoFlowApiKeyInput,
): Promise<RevealCassoFlowApiKeyResult> {
  return postWithIdempotency<RevealCassoFlowApiKeyResult>(
    `/api/v1/bank-connections/authorizations/${authorizationId}/reveal-key`,
    input,
  );
}

export function disconnectConnection(
  id: string,
): Promise<{ success: boolean }> {
  return postWithIdempotency(`/api/v1/bank-connections/${id}/disconnect`);
}

export function fetchAuthorizationAuditEvents(
  authorizationId: string,
): Promise<ConnectionAuditEventList> {
  return apiRequest<ConnectionAuditEventList>({
    url: `/api/v1/bank-connections/authorizations/${authorizationId}/audit-events?page=1&limit=50`,
    method: 'GET',
  });
}
