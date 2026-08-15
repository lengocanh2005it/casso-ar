import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { postMock, requestMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  requestMock: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({ post: postMock, request: requestMock })),
  },
}));

import {
  AuthTokenManager,
  apiRequest,
  apiRequestWithHeaders,
} from './api-client';

function tokenWithExpiry(expiresAt: number): string {
  return `header.${btoa(JSON.stringify({ exp: expiresAt }))}.signature`;
}

describe('AuthTokenManager', () => {
  let manager: AuthTokenManager;

  beforeEach(() => {
    manager = new AuthTokenManager();
    postMock.mockReset();
    requestMock.mockReset();
  });

  afterEach(() => vi.clearAllMocks());

  it('returns an unexpired access token without refreshing', async () => {
    const token = tokenWithExpiry(Math.floor(Date.now() / 1000) + 300);
    manager.setAccessToken(token);

    await expect(manager.getValidAccessToken()).resolves.toBe(token);
    expect(postMock).not.toHaveBeenCalled();
  });

  it('refreshes when the access token is missing', async () => {
    postMock.mockResolvedValue({ data: { accessToken: 'new-token' } });

    await expect(manager.getValidAccessToken()).resolves.toBe('new-token');
    expect(postMock).toHaveBeenCalledWith('/api/v1/auth/refresh', {});
  });

  it('shares one refresh request between concurrent callers', async () => {
    let resolveRefresh!: (value: { data: { accessToken: string } }) => void;
    postMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const first = manager.getValidAccessToken();
    const second = manager.getValidAccessToken();
    resolveRefresh({ data: { accessToken: 'shared-token' } });

    await expect(Promise.all([first, second])).resolves.toEqual([
      'shared-token',
      'shared-token',
    ]);
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it('allows public requests when refresh is unavailable', async () => {
    postMock.mockRejectedValue(new Error('no refresh cookie'));
    requestMock.mockResolvedValue({ data: { verified: true } });

    await expect(
      apiRequest({
        url: '/api/v1/auth/verify-email',
        method: 'GET',
      }),
    ).resolves.toEqual({ verified: true });
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/auth/verify-email',
        headers: {},
      }),
    );
  });

  it('dispatches the plan-limit event for HTTP 402 responses', async () => {
    const handler = vi.fn();
    window.addEventListener('casso:plan-limit', handler);
    const error = { response: { status: 402 } };
    requestMock.mockRejectedValue(error);

    await expect(
      apiRequest({ url: '/api/v1/receivables', method: 'POST' }),
    ).rejects.toBe(error);

    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('casso:plan-limit', handler);
  });

  it('dispatches the member-blocked event for MEMBER_BLOCKED errors', async () => {
    const handler = vi.fn();
    window.addEventListener('casso:member-blocked', handler);
    const error = {
      response: { status: 403, data: { errorCode: 'MEMBER_BLOCKED' } },
    };
    requestMock.mockRejectedValue(error);

    await expect(
      apiRequest({ url: '/api/v1/receivables', method: 'GET' }),
    ).rejects.toBe(error);

    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('casso:member-blocked', handler);
  });

  it('revokes the refresh session during logout', async () => {
    postMock.mockResolvedValue({ data: {} });

    manager.markLogoutInitiated();
    await manager.clearStaleRefreshSession();

    expect(postMock).toHaveBeenCalledWith('/api/v1/auth/logout');
    await expect(manager.getValidAccessToken()).resolves.toBeNull();
  });
});

describe('apiRequestWithHeaders', () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it('resolves with both the response data and headers', async () => {
    requestMock.mockResolvedValue({
      data: 'csv text',
      headers: { 'x-export-truncated': 'true' },
    });

    await expect(
      apiRequestWithHeaders({
        url: '/api/v1/receivables/export',
        method: 'GET',
      }),
    ).resolves.toEqual({
      data: 'csv text',
      headers: { 'x-export-truncated': 'true' },
    });
  });
});
