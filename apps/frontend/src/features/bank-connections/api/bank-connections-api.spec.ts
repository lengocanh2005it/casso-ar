import { describe, expect, it, vi } from 'vitest';
import {
  confirmCassoFlow,
  previewCassoFlowAccounts,
  previewCassoFlowAuthorizationRotation,
  rotateCassoFlowAuthorization,
} from './bank-connections-api';

const apiRequest = vi.fn();
const postWithIdempotency = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (...args: unknown[]) => postWithIdempotency(...args),
}));

describe('previewCassoFlowAccounts', () => {
  it('posts to the top-level preview endpoint', async () => {
    apiRequest.mockResolvedValue({ businessId: 'biz-1', accounts: [] });

    await expect(
      previewCassoFlowAccounts({ apiKey: 'test-key' }),
    ).resolves.toEqual({ businessId: 'biz-1', accounts: [] });

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/bank-connections/casso-flow/preview',
      method: 'POST',
      data: { apiKey: 'test-key' },
    });
  });
});

describe('confirmCassoFlow', () => {
  it('posts to the confirm endpoint', async () => {
    postWithIdempotency.mockResolvedValue({ connected: [], skipped: [] });

    await confirmCassoFlow({
      apiKey: 'test-key',
      selectedAccountNumbers: ['111'],
    });

    expect(postWithIdempotency).toHaveBeenCalledWith(
      '/api/v1/bank-connections/casso-flow/confirm',
      { apiKey: 'test-key', selectedAccountNumbers: ['111'] },
    );
  });
});

describe('previewCassoFlowAuthorizationRotation', () => {
  it('posts to the authorization-scoped preview endpoint', async () => {
    apiRequest.mockResolvedValue({
      businessId: 'biz-1',
      accounts: [],
      missingAccountNumbers: [],
    });

    await previewCassoFlowAuthorizationRotation('auth-1', {
      apiKey: 'test-key',
    });

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/bank-connections/authorizations/auth-1/casso-flow/preview',
      method: 'POST',
      data: { apiKey: 'test-key' },
    });
  });
});

describe('rotateCassoFlowAuthorization', () => {
  it('posts to the authorization-scoped confirm endpoint', async () => {
    postWithIdempotency.mockResolvedValue({
      rotatedAccountNumbers: [],
      newlyDiscovered: [],
    });

    await rotateCassoFlowAuthorization('auth-1', { apiKey: 'test-key' });

    expect(postWithIdempotency).toHaveBeenCalledWith(
      '/api/v1/bank-connections/authorizations/auth-1/casso-flow/confirm',
      { apiKey: 'test-key' },
    );
  });
});
