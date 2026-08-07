import { toUserProfileResponse } from './user-profile-response.dto';

describe('toUserProfileResponse', () => {
  it('does not leak organizationId', () => {
    const dto = toUserProfileResponse({
      id: 'user-1',
      email: 'owner@casso.vn',
      name: 'Owner',
      organizationId: 'org-1',
      subscriptionPlan: 'FREE',
    });

    expect(dto).not.toHaveProperty('organizationId');
    expect(dto).toEqual({
      id: 'user-1',
      email: 'owner@casso.vn',
      name: 'Owner',
      subscriptionPlan: 'FREE',
    });
  });
});
