import { toUserProfileResponse } from './user-profile-response.dto';

describe('toUserProfileResponse', () => {
  it('returns the session fields required by the frontend', () => {
    const dto = toUserProfileResponse({
      id: 'user-1',
      email: 'owner@casso.vn',
      name: 'Owner',
      organizationId: 'org-1',
      organizationName: 'Casso Ledger',
      role: 'OWNER',
      subscriptionPlan: 'FREE',
    });

    expect(dto).toEqual({
      id: 'user-1',
      email: 'owner@casso.vn',
      name: 'Owner',
      role: 'OWNER',
      organizationId: 'org-1',
      organizationName: 'Casso Ledger',
      subscriptionPlan: 'FREE',
    });
  });
});
