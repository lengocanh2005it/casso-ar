import { Role } from '@casso-ar/shared-types';
import { toUserProfileResponse } from './user-profile-response.dto';

describe('toUserProfileResponse', () => {
  it('returns the session fields required by the frontend', () => {
    const dto = toUserProfileResponse({
      id: 'user-1',
      email: 'owner@casso.vn',
      name: 'Owner',
      avatarUrl: null,
      organizationId: 'org-1',
      organizationName: 'Casso Ledger',
      role: Role.OWNER,
      subscriptionPlan: 'FREE',
      bankingLinked: true,
    });

    expect(dto).toEqual({
      id: 'user-1',
      email: 'owner@casso.vn',
      name: 'Owner',
      avatarUrl: null,
      role: Role.OWNER,
      organizationId: 'org-1',
      organizationName: 'Casso Ledger',
      subscriptionPlan: 'FREE',
      bankingLinked: true,
    });
  });
});
