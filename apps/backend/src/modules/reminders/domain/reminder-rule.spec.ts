import { ReminderRule } from './reminder-rule';

describe('ReminderRule', () => {
  it('rejects a negative minimum interval', () => {
    expect(
      () =>
        new ReminderRule({
          id: 'rule-1',
          reminderPolicyId: 'policy-1',
          offsetDays: -5,
          emailTemplateId: 'template-1',
          minIntervalDays: -1,
          createdAt: new Date('2026-08-03'),
        }),
    ).toThrow('minIntervalDays must be non-negative');
  });

  it('rejects non-integer offsetDays', () => {
    expect(
      () =>
        new ReminderRule({
          id: 'rule-1',
          reminderPolicyId: 'policy-1',
          offsetDays: 3.5,
          emailTemplateId: 'template-1',
          minIntervalDays: 7,
          createdAt: new Date('2026-08-03'),
        }),
    ).toThrow('offsetDays must be an integer');
  });

  it('accepts a valid rule', () => {
    const rule = new ReminderRule({
      id: 'rule-1',
      reminderPolicyId: 'policy-1',
      offsetDays: -5,
      emailTemplateId: 'template-1',
      minIntervalDays: 7,
      createdAt: new Date('2026-08-03'),
    });
    expect(rule.offsetDays).toBe(-5);
    expect(rule.minIntervalDays).toBe(7);
  });
});
