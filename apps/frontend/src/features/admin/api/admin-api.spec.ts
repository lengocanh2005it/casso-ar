import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

import {
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
