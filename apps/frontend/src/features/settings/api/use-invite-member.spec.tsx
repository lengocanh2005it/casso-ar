import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useInviteMember } from './use-settings';

const { inviteOrganizationMember } = vi.hoisted(() => ({
  inviteOrganizationMember: vi.fn(),
}));

vi.mock('./settings-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./settings-api')>()),
  inviteOrganizationMember,
}));

describe('useInviteMember', () => {
  it('refreshes the pending-invites list, not just the members list, after a successful invite', async () => {
    inviteOrganizationMember.mockResolvedValue({ id: 'invite-1' });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useInviteMember(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    result.current.mutate({
      organizationId: 'org-1',
      email: 'new@congty.vn',
      role: 'ACCOUNTANT',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['organization-invites', 'org-1'],
    });
  });
});
