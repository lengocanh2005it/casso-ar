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

  it('defaults escalationThresholdDays to 30 when omitted', () => {
    const policy = new ReminderPolicy({
      id: 'policy-1',
      organizationId: 'org-1',
      customerGroup: CustomerGroup.VIP,
      isActive: true,
      createdAt: new Date('2026-08-03'),
    });

    expect(policy.escalationThresholdDays).toBe(30);
  });

  it('rejects a non-positive escalation threshold', () => {
    expect(
      () =>
        new ReminderPolicy({
          id: 'policy-1',
          organizationId: 'org-1',
          customerGroup: CustomerGroup.VIP,
          isActive: true,
          escalationThresholdDays: 0,
          createdAt: new Date('2026-08-03'),
        }),
    ).toThrow('escalationThresholdDays must be a positive integer');
  });
});
