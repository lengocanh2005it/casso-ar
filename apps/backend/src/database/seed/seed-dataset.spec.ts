import { buildSeedCustomers, buildSeedReceivablePlans } from './seed-dataset';

describe('buildSeedCustomers', () => {
  it('returns a handful of customers with unique, non-empty tax codes and emails', () => {
    const customers = buildSeedCustomers();

    expect(customers.length).toBeGreaterThanOrEqual(3);
    const taxCodes = customers.map((c) => c.taxCode);
    const emails = customers.map((c) => c.email);
    expect(new Set(taxCodes).size).toBe(taxCodes.length);
    expect(new Set(emails).size).toBe(emails.length);
    for (const customer of customers) {
      expect(customer.name.length).toBeGreaterThan(0);
    }
  });
});

describe('buildSeedReceivablePlans', () => {
  const now = new Date('2026-08-17T00:00:00Z');
  const plans = buildSeedReceivablePlans(now, buildSeedCustomers().length);

  it('covers every target outcome at least once', () => {
    const outcomes = new Set(plans.map((p) => p.outcome));
    expect(outcomes).toEqual(
      new Set(['OPEN', 'OPEN_OVERDUE', 'PARTIALLY_PAID', 'PAID']),
    );
  });

  it('gives OPEN_OVERDUE a due date in the past relative to now', () => {
    for (const plan of plans.filter((p) => p.outcome === 'OPEN_OVERDUE')) {
      expect(plan.dueDate.getTime()).toBeLessThan(now.getTime());
    }
  });

  it('gives OPEN a due date in the future relative to now', () => {
    for (const plan of plans.filter((p) => p.outcome === 'OPEN')) {
      expect(plan.dueDate.getTime()).toBeGreaterThan(now.getTime());
    }
  });

  it('gives PARTIALLY_PAID a payment amount strictly between 0 and originalAmount', () => {
    for (const plan of plans.filter((p) => p.outcome === 'PARTIALLY_PAID')) {
      expect(plan.paymentAmount).toBeGreaterThan(0);
      expect(plan.paymentAmount).toBeLessThan(plan.originalAmount);
    }
  });

  it('gives PAID a payment amount equal to originalAmount', () => {
    for (const plan of plans.filter((p) => p.outcome === 'PAID')) {
      expect(plan.paymentAmount).toBe(plan.originalAmount);
    }
  });

  it('gives OPEN and OPEN_OVERDUE a payment amount of 0', () => {
    for (const plan of plans.filter(
      (p) => p.outcome === 'OPEN' || p.outcome === 'OPEN_OVERDUE',
    )) {
      expect(plan.paymentAmount).toBe(0);
    }
  });

  it('keeps every customerIndex within the seeded customer count', () => {
    for (const plan of plans) {
      expect(plan.customerIndex).toBeGreaterThanOrEqual(0);
      expect(plan.customerIndex).toBeLessThan(buildSeedCustomers().length);
    }
  });

  it('uses positive integer VND amounts', () => {
    for (const plan of plans) {
      expect(Number.isInteger(plan.originalAmount)).toBe(true);
      expect(plan.originalAmount).toBeGreaterThan(0);
    }
  });
});
