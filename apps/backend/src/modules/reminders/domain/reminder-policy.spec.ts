import { CustomerGroup } from '../../customers/domain/customer-group';
import { ReminderPolicy } from './reminder-policy';

describe('ReminderPolicy', () => {
  it('accepts a valid policy with active state', () => {
    const policy = new ReminderPolicy({
      id: 'policy-1',
      organizationId: 'org-1',
      customerGroup: CustomerGroup.VIP,
      isActive: true,
      createdAt: new Date('2026-08-03'),
    });
    expect(policy.customerGroup).toBe(CustomerGroup.VIP);
    expect(policy.isActive).toBe(true);
  });

  it('rejects an invalid customer group', () => {
    expect(
      () =>
        new ReminderPolicy({
          id: 'policy-1',
          organizationId: 'org-1',
          customerGroup: 'INVALID' as CustomerGroup,
          isActive: true,
          createdAt: new Date('2026-08-03'),
        }),
    ).toThrow('Invalid customer group');
  });
});
