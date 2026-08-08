import type { EntityManager } from 'typeorm';
import type { ReminderRule } from '../domain/reminder-rule';

export interface IReminderRuleRepository {
  findById(id: string): Promise<ReminderRule | null>;
  findByPolicyId(policyId: string): Promise<ReminderRule[]>;
  replaceForPolicy(
    policyId: string,
    rules: ReminderRule[],
    manager: EntityManager,
  ): Promise<void>;
}
