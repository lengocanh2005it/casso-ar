import { ReminderRule } from '../domain/reminder-rule';
import { findMatchingRule } from './reminder-rule-matcher';

const makeRule = (offsetDays: number): ReminderRule =>
  new ReminderRule({
    id: `rule-${offsetDays}`,
    reminderPolicyId: 'policy-1',
    offsetDays,
    emailTemplateId: 'template-1',
    minIntervalDays: 7,
    createdAt: new Date('2026-08-01'),
  });

describe('findMatchingRule', () => {
  it('returns the exact offset rule', () => {
    expect(findMatchingRule([makeRule(-5), makeRule(3)], -5)?.id).toBe(
      'rule--5',
    );
  });

  it('returns null when no exact offset exists', () => {
    expect(findMatchingRule([makeRule(-5)], -4)).toBeNull();
  });

  it('returns null for empty rules array', () => {
    expect(findMatchingRule([], -5)).toBeNull();
  });
});
