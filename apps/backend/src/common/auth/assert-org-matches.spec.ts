import { ForbiddenException } from '@nestjs/common';
import { assertOrgMatches } from './assert-org-matches';

describe('assertOrgMatches', () => {
  it('passes when the request user belongs to the route organization', () => {
    const request = { user: { organizationId: 'org-1' } } as never;
    expect(() => assertOrgMatches(request, 'org-1')).not.toThrow();
  });

  it('throws Forbidden when the route organization differs from the JWT', () => {
    const request = { user: { organizationId: 'org-1' } } as never;
    expect(() => assertOrgMatches(request, 'org-2')).toThrow(
      ForbiddenException,
    );
  });
});
