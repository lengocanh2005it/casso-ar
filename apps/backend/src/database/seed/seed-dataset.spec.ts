import {
  buildSeedAiUsagePlans,
  buildSeedBankTransactionPlans,
  buildSeedCustomers,
  buildSeedDisputedReceivablePlans,
  buildSeedInvoicePlans,
  buildSeedOperatorUserProps,
  buildSeedReceivablePlans,
  SEED_OPERATOR_EMAIL,
  seedAiUsageLogId,
} from './seed-dataset';

describe('seedAiUsageLogId', () => {
  it('returns the same id for the same conversation across runs', () => {
    // The row id is the only conflict target `ai_usage_logs` offers, so a
    // random UUID made every rerun append another copy of all 14 calls.
    expect(seedAiUsageLogId('seed-conversation-1')).toBe(
      seedAiUsageLogId('seed-conversation-1'),
    );
  });

  it('gives different conversations different ids', () => {
    expect(seedAiUsageLogId('seed-conversation-1')).not.toBe(
      seedAiUsageLogId('seed-conversation-2'),
    );
  });

  it('produces a value the uuid column accepts', () => {
    expect(seedAiUsageLogId('seed-conversation-1')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe('buildSeedAiUsagePlans', () => {
  const now = new Date('2026-10-03T12:00:00Z');
  const plans = buildSeedAiUsagePlans(now);

  it('spreads usage across several organizations and models', () => {
    expect(new Set(plans.map((p) => p.organizationIndex)).size).toBeGreaterThan(
      1,
    );
    expect(new Set(plans.map((p) => p.model)).size).toBeGreaterThan(1);
  });

  it('covers the 7-day window the admin dashboard queries', () => {
    // Seven calendar days, inclusive of both ends — the same range the admin
    // dashboards request. Spreading over daysAgo 0..6 is what keeps every row
    // inside it.
    const cutoff = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    for (const plan of plans) {
      expect(plan.createdAt.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(plan.createdAt.getTime()).toBeGreaterThanOrEqual(cutoff.getTime());
    }
    const distinctDays = new Set(
      plans.map((p) => p.createdAt.toISOString().slice(0, 10)),
    );
    expect(distinctDays.size).toBeGreaterThanOrEqual(5);
  });

  it('never stamps a row in the future, whatever time of day the seed runs', () => {
    // setHours() scattered rows across 09:00–16:00 local, so seeding early in
    // the morning produced timestamps up to seven hours ahead of "now" and the
    // charts silently dropped them. CI runs in UTC and failed on exactly this.
    for (const seedInstant of [
      new Date('2026-10-03T00:15:00Z'),
      new Date('2026-10-03T09:05:00Z'),
      new Date('2026-10-03T23:50:00Z'),
    ]) {
      for (const plan of buildSeedAiUsagePlans(seedInstant)) {
        expect(plan.createdAt.getTime()).toBeLessThanOrEqual(
          seedInstant.getTime(),
        );
      }
    }
  });

  it('keeps every row a valid AI usage log', () => {
    for (const plan of plans) {
      expect(plan.model.length).toBeGreaterThan(0);
      expect(plan.conversationId.length).toBeGreaterThan(0);
      expect(plan.promptVersion.length).toBeGreaterThan(0);
      expect(plan.inputTokens).not.toBeNull();
      expect(plan.inputTokens).toBeGreaterThan(0);
      expect(plan.outputTokens).not.toBeNull();
      expect(plan.outputTokens).toBeGreaterThan(0);
      expect(plan.latencyMs).toBeGreaterThan(0);
      expect(plan.toolCallsCount).toBeGreaterThanOrEqual(0);
    }
  });

  it('produces at least one failed request so the error column has data', () => {
    expect(plans.some((p) => p.isError)).toBe(true);
    expect(plans.some((p) => !p.isError)).toBe(true);
  });
});

describe('buildSeedCustomers', () => {
  it('returns a varied business catalog with unique, realistic contact data', () => {
    const customers = buildSeedCustomers();

    expect(customers.length).toBeGreaterThanOrEqual(16);
    const taxCodes = customers.map((c) => c.taxCode);
    const emails = customers.map((c) => c.email);
    expect(new Set(taxCodes).size).toBe(taxCodes.length);
    expect(new Set(emails).size).toBe(emails.length);
    for (const customer of customers) {
      expect(customer.name.length).toBeGreaterThan(0);
      expect(customer.taxCode).toMatch(/^\d{10}$/);
      expect(customer.phone).toMatch(/^0\d{9}$/);
      expect(customer.email).toMatch(/@[^@]+\.test$/);
      expect(`${customer.name} ${customer.email}`).not.toMatch(/seed/i);
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

  it('contains enough records to make the local workspace useful for demos', () => {
    expect(plans.length).toBeGreaterThanOrEqual(60);
  });
});

describe('buildSeedInvoicePlans and buildSeedBankTransactionPlans', () => {
  const now = new Date('2026-08-17T00:00:00Z');

  it('provides enough invoices and bank transactions for varied reports', () => {
    const receivablePlans = buildSeedReceivablePlans(
      now,
      buildSeedCustomers().length,
    );
    const disputedPlans = buildSeedDisputedReceivablePlans(
      now,
      buildSeedCustomers().length,
    );
    const invoicePlans = buildSeedInvoicePlans(
      now,
      receivablePlans,
      disputedPlans,
      buildSeedCustomers().length,
    );

    expect(invoicePlans.length).toBeGreaterThanOrEqual(30);
    expect(buildSeedBankTransactionPlans(now)).toHaveLength(60);

    const allReceivablePlans = [...receivablePlans, ...disputedPlans];
    const linkedInvoices = invoicePlans.filter(
      (plan) => plan.receivableIndex !== null,
    );
    expect(linkedInvoices.length).toBeGreaterThanOrEqual(15);
    for (const invoice of linkedInvoices) {
      if (invoice.receivableIndex === null) continue;
      const receivable = allReceivablePlans[invoice.receivableIndex];
      expect(receivable.originalAmount).toBe(invoice.totalAmount);
      expect(receivable.customerIndex).toBe(invoice.customerIndex);
    }
  });

  it('links every receivable to an invoice so Copilot can show an invoice number', () => {
    const receivablePlans = buildSeedReceivablePlans(
      now,
      buildSeedCustomers().length,
    );
    const disputedPlans = buildSeedDisputedReceivablePlans(
      now,
      buildSeedCustomers().length,
    );
    const invoicePlans = buildSeedInvoicePlans(
      now,
      receivablePlans,
      disputedPlans,
      buildSeedCustomers().length,
    );

    const allReceivablePlans = [...receivablePlans, ...disputedPlans];
    const linkedIndexes = new Set(
      invoicePlans
        .map((plan) => plan.receivableIndex)
        .filter((index): index is number => index !== null),
    );
    const unlinked = allReceivablePlans.filter(
      (_, index) => !linkedIndexes.has(index),
    );

    expect(unlinked).toEqual([]);
  });
});

describe('buildSeedOperatorUserProps', () => {
  const now = new Date('2026-08-17T00:00:00Z');
  const props = buildSeedOperatorUserProps(
    'operator-id',
    'hashed-password',
    now,
  );

  it('is a platform-level operator with no organization/membership fields', () => {
    expect(props.isOperator).toBe(true);
    expect(props.email).toBe(SEED_OPERATOR_EMAIL);
  });

  it('is already email-verified so it is usable immediately', () => {
    expect(props.emailVerifiedAt).toEqual(now);
  });

  it('uses a human-readable operator identity without seed placeholders', () => {
    expect(props.name).not.toMatch(/seed/i);
    expect(props.email).not.toMatch(/seed/i);
  });

  it('passes the id and password hash through unchanged', () => {
    expect(props.id).toBe('operator-id');
    expect(props.passwordHash).toBe('hashed-password');
  });
});
