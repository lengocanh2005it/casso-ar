import { describe, expect, it, vi } from 'vitest';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: vi.fn(),
}));

import {
  changeMemberRole,
  fetchOrganizationInvites,
  fetchSmtpConfig,
  removeMember,
  resendInvite,
  revokeInvite,
} from './settings-api';

describe('fetchSmtpConfig', () => {
  it('returns null when the API responds 404 (not configured)', async () => {
    apiRequest.mockRejectedValueOnce({ response: { status: 404 } });

    expect(await fetchSmtpConfig()).toBeNull();
  });

  it('returns the config on success', async () => {
    const config = {
      host: 'smtp.congtyb.vn',
      port: 587,
      username: 'noreply@congtyb.vn',
      fromAddress: 'noreply@congtyb.vn',
      status: 'CONNECTED',
    };
    apiRequest.mockResolvedValueOnce(config);

    expect(await fetchSmtpConfig()).toEqual(config);
  });

  it('rethrows any non-404 error', async () => {
    const error = { response: { status: 500 } };
    apiRequest.mockRejectedValueOnce(error);

    await expect(fetchSmtpConfig()).rejects.toBe(error);
  });
});

describe('changeMemberRole', () => {
  it('sends a PATCH with the new role', async () => {
    apiRequest.mockResolvedValueOnce({
      id: 'm1',
      userId: 'u1',
      role: 'VIEWER',
    });

    await changeMemberRole('org-1', 'u1', 'VIEWER');

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/organizations/org-1/members/u1',
        method: 'PATCH',
        data: { role: 'VIEWER' },
      }),
    );
  });
});

describe('removeMember', () => {
  it('sends a DELETE for the member', async () => {
    apiRequest.mockResolvedValueOnce(undefined);

    await removeMember('org-1', 'u1');

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/organizations/org-1/members/u1',
        method: 'DELETE',
      }),
    );
  });
});

describe('fetchOrganizationInvites', () => {
  it('fetches pending invites for the organization', async () => {
    const list = { items: [], total: 0, page: 1, limit: 100 };
    apiRequest.mockResolvedValueOnce(list);

    await expect(fetchOrganizationInvites('org-1')).resolves.toEqual(list);
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/organizations/org-1/invites?page=1&limit=100',
        method: 'GET',
      }),
    );
  });
});

describe('revokeInvite', () => {
  it('sends a DELETE for the invite', async () => {
    apiRequest.mockResolvedValueOnce(undefined);

    await revokeInvite('org-1', 'inv-1');

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/organizations/org-1/invites/inv-1',
        method: 'DELETE',
      }),
    );
  });
});

describe('resendInvite', () => {
  it('sends a POST to resend the invite', async () => {
    apiRequest.mockResolvedValueOnce({ success: true });

    await resendInvite('org-1', 'inv-1');

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/organizations/org-1/invites/inv-1/resend',
        method: 'POST',
      }),
    );
  });
});
