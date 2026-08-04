import { Role } from '../../modules/organizations/domain/membership';
import { TenantContextService } from './tenant-context';

describe('TenantContextService', () => {
  it('returns undefined when called outside of run()', () => {
    const service = new TenantContextService();
    expect(service.getCurrentUser()).toBeUndefined();
  });

  it('returns the user set by run() only within that callback', () => {
    const service = new TenantContextService();
    const user = {
      userId: 'user-1',
      organizationId: 'org-1',
      role: Role.OWNER,
    };

    service.run(user, () => {
      expect(service.getCurrentUser()).toEqual(user);
    });

    expect(service.getCurrentUser()).toBeUndefined();
  });
});
