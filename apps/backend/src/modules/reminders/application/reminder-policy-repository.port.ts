import type { EntityManager } from 'typeorm';
import type { CustomerGroup } from '../../customers/domain/customer-group';
import type { ReminderPolicy } from '../domain/reminder-policy';

export interface IReminderPolicyRepository {
  findById(id: string): Promise<ReminderPolicy | null>;
  findByCustomerGroup(
    customerGroup: CustomerGroup,
  ): Promise<ReminderPolicy | null>;
  findAll(): Promise<ReminderPolicy[]>;
  findAllOrganizationIdsForScheduler(): Promise<string[]>;
  save(policy: ReminderPolicy, manager?: EntityManager): Promise<void>;
}
