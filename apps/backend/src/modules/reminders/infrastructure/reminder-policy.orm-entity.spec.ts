import { CustomerGroup } from '../../customers/domain/customer-group';
import { ReminderPolicyOrmEntity } from './reminder-policy.orm-entity';

describe('ReminderPolicyOrmEntity', () => {
  it('maps CustomerGroup to column type', () => {
    const entity = new ReminderPolicyOrmEntity();
    entity.id = 'policy-1';
    entity.organizationId = 'org-1';
    entity.customerGroup = CustomerGroup.VIP;
    entity.isActive = true;
    entity.createdAt = new Date('2026-08-03');

    expect(entity.customerGroup).toBe(CustomerGroup.VIP);
  });
});
