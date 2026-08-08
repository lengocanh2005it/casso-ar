import type { ReminderRule } from '../domain/reminder-rule';

export function findMatchingRule(
  rules: readonly ReminderRule[],
  offsetDays: number,
): ReminderRule | null {
  return rules.find((rule) => rule.offsetDays === offsetDays) ?? null;
}
