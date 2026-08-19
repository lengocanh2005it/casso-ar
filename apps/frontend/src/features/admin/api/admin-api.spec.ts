import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

import {
  approveOrganization,
  listOrganizations,
  rejectOrganization,
  resendOrganizationInvite,
  revokeOrganizationInvite,
} from './admin-api';

describe('admin pending invite API', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue(undefined);
  });

  it('resends an invite with POST and an idempotency header', async () => {
    await resendOrganizationInvite('org-1', 'invite-1');

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/admin/organizations/org-1/invites/invite-1/resend',
      method: 'POST',
      headers: { 'Idempotency-Key': expect.any(String) },
    });
  });

  it('revokes an invite with DELETE and an idempotency header', async () => {
    await revokeOrganizationInvite('org-1', 'invite-1');

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/admin/organizations/org-1/invites/invite-1',
      method: 'DELETE',
      headers: { 'Idempotency-Key': expect.any(String) },
    });
  });
});

describe('admin organization status API', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue(undefined);
  });

  it('lists organizations filtered by status', async () => {
    apiRequest.mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 });

    await listOrganizations(1, 50, 'PENDING_REVIEW');

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/admin/organizations',
      method: 'GET',
      params: { page: 1, limit: 50, status: 'PENDING_REVIEW' },
    });
  });

  it('approves an organization', async () => {
    apiRequest.mockResolvedValue({ status: 'ACTIVE' });

    await approveOrganization('org-1');

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/admin/organizations/org-1/approve',
      method: 'POST',
    });
  });

  it('rejects an organization with a reason', async () => {
    apiRequest.mockResolvedValue({ status: 'REJECTED' });

    await rejectOrganization('org-1', 'MST không khớp');

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/admin/organizations/org-1/reject',
      method: 'POST',
      data: { reason: 'MST không khớp' },
    });
  });
});
