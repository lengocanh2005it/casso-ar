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
  getApiErrorCode,
  getApiErrorMessage,
} from './api-client';

function tokenWithExpiry(expiresAt: number): string {
  return `header.${btoa(JSON.stringify({ exp: expiresAt }))}.signature`;
}

// An axios timeout rejects with no `response`, which is what makes the token
// manager treat it as transient rather than a dead session.
const TIMEOUT_ERROR = {
  code: 'ECONNABORTED',
  message: 'timeout of 10000ms exceeded',
  config: {},
  request: {},
};

describe('AuthTokenManager', () => {
  let manager: AuthTokenManager;

  beforeEach(() => {
    localStorage.clear();
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
    expect(postMock).toHaveBeenCalledWith(
      '/api/v1/auth/refresh',
      {},
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
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

  it('drops a stale refresh result and aborts it once a newer token is set', async () => {
    let resolveRefresh!: (value: { data: { accessToken: string } }) => void;
    let capturedSignal: AbortSignal | undefined;
    postMock.mockImplementation(
      (_url: string, _data: unknown, config?: { signal?: AbortSignal }) => {
        capturedSignal = config?.signal;
        return new Promise((resolve) => {
          resolveRefresh = resolve;
        });
      },
    );

    const stalePromise = manager.getValidAccessToken();
    const freshToken = tokenWithExpiry(Math.floor(Date.now() / 1000) + 300);
    manager.setAccessToken(freshToken);
    resolveRefresh({ data: { accessToken: 'stale-token' } });
    await stalePromise;

    expect(manager.getAccessToken()).toBe(freshToken);
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('revokes the refresh session during logout', async () => {
    postMock.mockResolvedValue({ data: {} });

    manager.markLogoutInitiated();
    await manager.clearStaleRefreshSession();

    expect(postMock).toHaveBeenCalledWith('/api/v1/auth/logout');
    await expect(manager.getValidAccessToken()).resolves.toBeNull();
  });

  it('has no known session before any login has ever happened', () => {
    expect(manager.hasKnownSession()).toBe(false);
  });

  it('remembers a session across instances once a token is set', () => {
    manager.setAccessToken('some-token');

    expect(new AuthTokenManager().hasKnownSession()).toBe(true);
  });

  it('remembers a session across instances once a refresh succeeds', async () => {
    postMock.mockResolvedValue({ data: { accessToken: 'new-token' } });

    await manager.getValidAccessToken();

    expect(new AuthTokenManager().hasKnownSession()).toBe(true);
  });

  it('forgets the session once logout is initiated', () => {
    manager.setAccessToken('some-token');
    manager.markLogoutInitiated();

    expect(new AuthTokenManager().hasKnownSession()).toBe(false);
  });

  it.each([401, 403])(
    'forgets the session once a refresh is rejected with %i',
    async (status) => {
      localStorage.setItem('casso:has-session', '1');
      postMock.mockRejectedValue({ response: { status } });

      await manager.getValidAccessToken();

      expect(new AuthTokenManager().hasKnownSession()).toBe(false);
    },
  );

  it.each([
    ['a network error', new Error('Network Error')],
    ['a 500 response', { response: { status: 500 } }],
    ['a 429 response', { response: { status: 429 } }],
    ['a timeout', TIMEOUT_ERROR],
  ])(
    'keeps the session when a refresh fails with %s',
    async (_label, error) => {
      localStorage.setItem('casso:has-session', '1');
      postMock.mockRejectedValue(error);

      await manager.getValidAccessToken();

      expect(new AuthTokenManager().hasKnownSession()).toBe(true);
    },
  );

  it('gives the refresh request a bounded timeout', async () => {
    postMock.mockResolvedValue({ data: { accessToken: 'new-token' } });

    await manager.getValidAccessToken();

    expect(postMock).toHaveBeenCalledWith(
      '/api/v1/auth/refresh',
      {},
      expect.objectContaining({ timeout: 10_000 }),
    );
  });
});

describe('AuthTokenManager refresh across tabs', () => {
  // Minimal exclusive Web Locks stand-in: requests for one name run one at a
  // time, in arrival order.
  function installFakeLocks() {
    let tail: Promise<unknown> = Promise.resolve();
    const request = vi.fn(
      (_name: string, callback: () => Promise<unknown>): Promise<unknown> => {
        const result = tail.then(callback);
        tail = result.catch(() => undefined);
        return result;
      },
    );
    Object.defineProperty(navigator, 'locks', {
      value: { request },
      configurable: true,
    });
    return request;
  }

  beforeEach(() => {
    localStorage.clear();
    postMock.mockReset();
    requestMock.mockReset();
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'locks');
    vi.clearAllMocks();
  });

  it('sends refreshes from different tabs one at a time under a shared lock', async () => {
    const lockRequest = installFakeLocks();
    const resolvers: Array<(value: { data: { accessToken: string } }) => void> =
      [];
    postMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const tabA = new AuthTokenManager();
    const tabB = new AuthTokenManager();

    const first = tabA.getValidAccessToken();
    const second = tabB.getValidAccessToken();
    await vi.waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    // The second tab must still be waiting for the lock.
    await Promise.resolve();
    expect(postMock).toHaveBeenCalledTimes(1);

    resolvers[0]({ data: { accessToken: 'token-a' } });
    await vi.waitFor(() => expect(postMock).toHaveBeenCalledTimes(2));
    resolvers[1]({ data: { accessToken: 'token-b' } });

    await expect(Promise.all([first, second])).resolves.toEqual([
      'token-a',
      'token-b',
    ]);
    expect(lockRequest).toHaveBeenCalledWith(
      'casso:refresh',
      expect.any(Function),
    );
  });

  it('refreshes directly when Web Locks is unavailable', async () => {
    postMock.mockResolvedValue({ data: { accessToken: 'direct-token' } });

    await expect(new AuthTokenManager().getValidAccessToken()).resolves.toBe(
      'direct-token',
    );
  });

  it('lets the next tab refresh after an earlier one fails', async () => {
    installFakeLocks();
    postMock
      .mockRejectedValueOnce(TIMEOUT_ERROR)
      .mockResolvedValueOnce({ data: { accessToken: 'token-b' } });
    const tabA = new AuthTokenManager();
    const tabB = new AuthTokenManager();

    const first = tabA.getValidAccessToken();
    const second = tabB.getValidAccessToken();

    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toBe('token-b');
    expect(postMock).toHaveBeenCalledTimes(2);
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

describe('getApiErrorCode', () => {
  it('returns the backend error code from an axios-shaped error', () => {
    expect(
      getApiErrorCode({
        response: { data: { errorCode: 'ALLOCATION_EXCEEDS_REMAINING' } },
      }),
    ).toBe('ALLOCATION_EXCEEDS_REMAINING');
  });

  it('returns undefined for values that are not axios-shaped API errors', () => {
    expect(getApiErrorCode(new Error('plain error'))).toBeUndefined();
    expect(getApiErrorCode({ response: { data: {} } })).toBeUndefined();
    expect(getApiErrorCode(null)).toBeUndefined();
  });
});

describe('getApiErrorMessage', () => {
  it('returns the backend message from an axios-shaped error', () => {
    expect(
      getApiErrorMessage({
        response: { data: { message: 'Tổ chức của bạn đang chờ được duyệt.' } },
      }),
    ).toBe('Tổ chức của bạn đang chờ được duyệt.');
  });

  it('returns undefined for values that are not axios-shaped API errors', () => {
    expect(getApiErrorMessage(new Error('plain error'))).toBeUndefined();
    expect(getApiErrorMessage({ response: { data: {} } })).toBeUndefined();
    expect(getApiErrorMessage(null)).toBeUndefined();
  });
});
