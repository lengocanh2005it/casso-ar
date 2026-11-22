import { ReceivableStatus } from '@casso-ar/shared-types';
import { Receivable } from '../../../receivables/domain/receivable';
import {
  RankReceivablesByRiskTool,
  type RiskSignals,
  scoreRisk,
} from './rank-receivables-by-risk.tool';

// Every signal is off. remainingToMedianRatio is 0 here (not 1) so the
// LARGE_BALANCE signal contributes nothing: the documented weight is
// min(15, floor(ratio * 5)), so a ratio of 1 would already score 5 points.
const base: RiskSignals = {
  daysOverdue: 0,
  hasOpenDispute: false,
  hasPriorSentReminder: false,
  latePaymentRatio: 0,
  remainingToMedianRatio: 0,
};

describe('scoreRisk', () => {
  it('returns LOW with no reasons for a clean, on-time receivable', () => {
    expect(scoreRisk(base)).toEqual({
      riskScore: 0,
      riskBand: 'LOW',
      reasons: [],
    });
  });

  it('is deterministic for identical signals', () => {
    const signals: RiskSignals = {
      daysOverdue: 12,
      hasOpenDispute: true,
      hasPriorSentReminder: false,
      latePaymentRatio: 0.25,
      remainingToMedianRatio: 2,
    };
    expect(scoreRisk(signals)).toEqual(scoreRisk(signals));
  });

  it('adds exactly the documented points for each fired signal', () => {
    const result = scoreRisk({
      daysOverdue: 9, // floor(9 / 3) = 3
      hasOpenDispute: true, // 20
      hasPriorSentReminder: true, // 5 (the port exposes 0 or 1 only)
      latePaymentRatio: 0.5, // floor(0.5 * 20) = 10
      remainingToMedianRatio: 4, // floor(4 * 5) = 20, capped at 15
    });
    expect(result.riskScore).toBe(3 + 20 + 5 + 10 + 15); // 53
    expect(result.reasons.map((reason) => reason.code)).toEqual([
      'OVERDUE_DEPTH',
      'OPEN_DISPUTE',
      'REMINDER_FATIGUE',
      'LATE_PAYMENT_HISTORY',
      'LARGE_BALANCE',
    ]);
    expect(result.reasons.every((reason) => reason.message.length > 0)).toBe(
      true,
    );
  });

  it('caps each signal at its documented maximum', () => {
    const result = scoreRisk({
      daysOverdue: 365, // capped at 30
      hasOpenDispute: true, // 20
      hasPriorSentReminder: true, // 5
      latePaymentRatio: 1, // 20
      remainingToMedianRatio: 20, // capped at 15
    });
    expect(result.riskScore).toBe(30 + 20 + 5 + 20 + 15); // 90 = practical max
    expect(result.riskBand).toBe('HIGH');
  });

  it('applies the documented large-balance weight min(15, floor(ratio * 5))', () => {
    const atMedian = scoreRisk({ ...base, remainingToMedianRatio: 1 });
    expect(atMedian.riskScore).toBe(5);
    expect(atMedian.reasons.map((reason) => reason.code)).toEqual([
      'LARGE_BALANCE',
    ]);

    const tripleMedian = scoreRisk({ ...base, remainingToMedianRatio: 3 });
    expect(tripleMedian.riskScore).toBe(15);
  });

  it('uses inclusive band boundaries 30 and 60', () => {
    const atThirty = scoreRisk({ ...base, daysOverdue: 90 }); // 90 / 3 = 30
    expect(atThirty.riskScore).toBe(30);
    expect(atThirty.riskBand).toBe('MEDIUM');

    const atFiftyNine = scoreRisk({
      ...base,
      daysOverdue: 87, // 29
      hasOpenDispute: true, // 20
      latePaymentRatio: 0.5, // 10
    });
    expect(atFiftyNine.riskScore).toBe(59);
    expect(atFiftyNine.riskBand).toBe('MEDIUM');

    const atSixty = scoreRisk({
      ...base,
      daysOverdue: 90, // 30
      hasOpenDispute: true, // 20
      latePaymentRatio: 0.5, // 10
    });
    expect(atSixty.riskScore).toBe(60);
    expect(atSixty.riskBand).toBe('HIGH');
  });

  it('never emits a reason for a signal below one point', () => {
    const result = scoreRisk({ ...base, daysOverdue: 1 });
    expect(result.riskScore).toBe(0); // floor(1 / 3) === 0
    expect(result.reasons).toEqual([]);
    expect(result.riskBand).toBe('LOW');
  });
});

function receivable(overrides: {
  id: string;
  customerId?: string;
  originalAmount: number;
  paidAmount?: number;
  dueDate: string;
}): Receivable {
  return new Receivable({
    id: overrides.id,
    organizationId: 'org-1',
    customerId: overrides.customerId ?? 'cust-1',
    invoiceId: `inv-${overrides.id}`,
    originalAmount: overrides.originalAmount,
    paidAmount: overrides.paidAmount ?? 0,
    dueDate: new Date(overrides.dueDate),
    status: ReceivableStatus.OPEN,
    salesRepresentativeId: null,
    createdAt: new Date('2026-01-01'),
    closedAt: null,
    version: 1,
  });
}

function buildTool(overrides: Record<string, unknown> = {}) {
  const deps = {
    receivableRepo: {
      findOverdueCandidates: jest.fn().mockResolvedValue([]),
      findByIds: jest.fn().mockResolvedValue(new Map()),
    },
    customerRepo: {
      findIdsBySearch: jest.fn().mockResolvedValue([]),
      findByIds: jest.fn().mockResolvedValue(new Map()),
    },
    invoiceRepo: {
      findIdsByInvoiceNumberSearch: jest.fn().mockResolvedValue([]),
      findByIds: jest.fn().mockResolvedValue(new Map()),
    },
    disputeRepo: {
      findOpenDisputesByReceivableIds: jest.fn().mockResolvedValue(new Map()),
    },
    reminderRepo: {
      findLatestSentByReceivableIds: jest.fn().mockResolvedValue(new Map()),
    },
    allocationRepo: { findByCustomerId: jest.fn().mockResolvedValue([]) },
    tenantContext: {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
      getCurrentUser: jest
        .fn()
        .mockReturnValue({ role: 'FINANCE_MANAGER', userId: 'user-1' }),
    },
    ...overrides,
  };
  const tool = new RankReceivablesByRiskTool(
    deps.receivableRepo as any,
    deps.customerRepo as any,
    deps.invoiceRepo as any,
    deps.disputeRepo as any,
    deps.reminderRepo as any,
    deps.allocationRepo as any,
    deps.tenantContext as any,
  );
  return { tool, deps };
}

describe('RankReceivablesByRiskTool', () => {
  it('queries open receivables due before the end of the 7-day Saigon horizon', async () => {
    const { tool, deps } = buildTool();
    // 2026-11-22T00:00Z is 07:00 on 2026-11-22 in Asia/Ho_Chi_Minh, so the
    // horizon runs to the start of 2026-11-30 local time (= 2026-11-29T17:00Z),
    // covering the whole seventh local day.
    const now = new Date('2026-11-22T00:00:00.000Z');

    await expect(tool.execute({}, now)).resolves.toEqual({ items: [] });
    expect(deps.receivableRepo.findOverdueCandidates).toHaveBeenCalledTimes(1);
    const filters = deps.receivableRepo.findOverdueCandidates.mock.calls[0][0];
    expect(filters.organizationId).toBe('org-1');
    expect(filters.referenceDate).toEqual(new Date('2026-11-29T17:00:00.000Z'));
    expect(
      deps.disputeRepo.findOpenDisputesByReceivableIds,
    ).not.toHaveBeenCalled();
    expect(
      deps.reminderRepo.findLatestSentByReceivableIds,
    ).not.toHaveBeenCalled();
    expect(deps.allocationRepo.findByCustomerId).not.toHaveBeenCalled();
  });

  it('sorts by riskScore desc then dueDate asc and emits explained items', async () => {
    // Two receivables for one customer with equal remaining amounts, so the
    // customer median is the shared amount and the LARGE_BALANCE ratio is 1
    // (5 points) for both. The dispute on rec-new is what must win: 20 + 5
    // against rec-old's 5.
    const older = receivable({
      id: 'rec-old',
      originalAmount: 5_000_000,
      dueDate: '2026-10-01T00:00:00.000Z',
    });
    const newer = receivable({
      id: 'rec-new',
      originalAmount: 5_000_000,
      dueDate: '2026-11-20T00:00:00.000Z',
    });
    const { tool, deps } = buildTool({
      receivableRepo: {
        findOverdueCandidates: jest.fn().mockResolvedValue([newer, older]),
        findByIds: jest.fn().mockResolvedValue(
          new Map([
            ['rec-old', older],
            ['rec-new', newer],
          ]),
        ),
      },
      disputeRepo: {
        findOpenDisputesByReceivableIds: jest
          .fn()
          .mockResolvedValue(new Map([['rec-new', 'disp-1']])),
      },
      customerRepo: {
        findIdsBySearch: jest.fn().mockResolvedValue([]),
        findByIds: jest
          .fn()
          .mockResolvedValue(new Map([['cust-1', { name: 'Alpha Corp' }]])),
      },
      invoiceRepo: {
        findIdsByInvoiceNumberSearch: jest.fn().mockResolvedValue([]),
        findByIds: jest.fn().mockResolvedValue(
          new Map([
            ['inv-rec-new', { invoiceNumber: 'INV-2' }],
            ['inv-rec-old', { invoiceNumber: 'INV-1' }],
          ]),
        ),
      },
    });

    const result = await tool.execute({}, new Date('2026-11-22T00:00:00.000Z'));

    expect(result.items.map((item) => item.receivableId)).toEqual([
      'rec-new',
      'rec-old',
    ]);
    expect(result.items[0]).toMatchObject({
      customerId: 'cust-1',
      customerName: 'Alpha Corp',
      invoiceNumber: 'INV-2',
      remainingAmount: 5_000_000,
      riskScore: 25,
      riskBand: 'LOW',
    });
    expect(result.items[0].reasons.map((reason) => reason.code)).toContain(
      'OPEN_DISPUTE',
    );
    // rec-old is 52 days overdue (floor(52 / 3) = 17) plus the 5-point
    // LARGE_BALANCE signal it shares with rec-new: 22 against rec-new's
    // 20 (dispute) + 5.
    expect(result.items[1].riskScore).toBe(22);
    expect(
      deps.reminderRepo.findLatestSentByReceivableIds,
    ).toHaveBeenCalledTimes(1);
    expect(deps.allocationRepo.findByCustomerId).toHaveBeenCalledTimes(1);
  });

  it('breaks a riskScore tie by the earliest due date', async () => {
    // Neither receivable is overdue yet, so both score only the 5-point
    // LARGE_BALANCE signal and the tie must be broken by dueDate.
    const later = receivable({
      id: 'rec-later',
      originalAmount: 1_000_000,
      dueDate: '2026-11-26T00:00:00.000Z',
    });
    const earlier = receivable({
      id: 'rec-earlier',
      originalAmount: 1_000_000,
      dueDate: '2026-11-24T00:00:00.000Z',
    });
    const { tool } = buildTool({
      receivableRepo: {
        findOverdueCandidates: jest.fn().mockResolvedValue([later, earlier]),
        findByIds: jest.fn().mockResolvedValue(new Map()),
      },
    });

    const result = await tool.execute({}, new Date('2026-11-22T00:00:00.000Z'));

    expect(result.items.map((item) => item.receivableId)).toEqual([
      'rec-earlier',
      'rec-later',
    ]);
    expect(result.items.map((item) => item.riskScore)).toEqual([5, 5]);
  });

  it('rejects a non-integer or out-of-range limit', async () => {
    const { tool } = buildTool();
    await expect(tool.execute({ limit: 11 })).rejects.toThrow('từ 1 đến 10');
    await expect(tool.execute({ limit: 1.5 })).rejects.toThrow('từ 1 đến 10');
    await expect(tool.execute({ limit: 0 })).rejects.toThrow('từ 1 đến 10');
  });

  it('scopes SALES_REP users to their own receivables', async () => {
    const { tool, deps } = buildTool({
      tenantContext: {
        getOrganizationId: jest.fn().mockReturnValue('org-1'),
        getCurrentUser: jest
          .fn()
          .mockReturnValue({ role: 'SALES_REP', userId: 'sales-1' }),
      },
    });
    await tool.execute({}, new Date('2026-11-22T00:00:00.000Z'));
    expect(
      deps.receivableRepo.findOverdueCandidates.mock.calls[0][0]
        .salesRepresentativeId,
    ).toBe('sales-1');
  });

  it('computes late-payment ratio from allocations matched to receivable due dates', async () => {
    const target = receivable({
      id: 'rec-1',
      originalAmount: 10_000_000,
      dueDate: '2026-10-01T00:00:00.000Z',
    });
    const { tool } = buildTool({
      receivableRepo: {
        findOverdueCandidates: jest.fn().mockResolvedValue([target]),
        findByIds: jest.fn().mockResolvedValue(new Map([['rec-1', target]])),
      },
      allocationRepo: {
        findByCustomerId: jest.fn().mockResolvedValue([
          {
            receivableId: 'rec-1',
            allocatedAmount: 1_000_000,
            allocatedAt: new Date('2026-10-20T00:00:00.000Z'),
            deletedAt: null,
            isActive: () => true,
          },
        ]),
      },
    });
    const result = await tool.execute({}, new Date('2026-11-22T00:00:00.000Z'));
    expect(result.items[0].reasons.map((reason) => reason.code)).toContain(
      'LATE_PAYMENT_HISTORY',
    );
  });

  it('narrows candidates by customer and invoice search matches', async () => {
    const { tool, deps } = buildTool({
      customerRepo: {
        findIdsBySearch: jest.fn().mockResolvedValue(['cust-9']),
        findByIds: jest.fn().mockResolvedValue(new Map()),
      },
      invoiceRepo: {
        findIdsByInvoiceNumberSearch: jest.fn().mockResolvedValue(['inv-9']),
        findByIds: jest.fn().mockResolvedValue(new Map()),
      },
    });

    await tool.execute(
      { search: '  Alpha  ' },
      new Date('2026-11-22T00:00:00.000Z'),
    );

    expect(deps.customerRepo.findIdsBySearch).toHaveBeenCalledWith(
      'org-1',
      'Alpha',
    );
    expect(deps.invoiceRepo.findIdsByInvoiceNumberSearch).toHaveBeenCalledWith(
      'org-1',
      'Alpha',
    );
    const filters = deps.receivableRepo.findOverdueCandidates.mock.calls[0][0];
    expect(filters.customerIdIn).toEqual(['cust-9']);
    expect(filters.invoiceIdIn).toEqual(['inv-9']);
  });

  it('returns no items without touching signal ports when the search matches nothing', async () => {
    const { tool, deps } = buildTool();

    await expect(
      tool.execute(
        { search: 'khong-ton-tai' },
        new Date('2026-11-22T00:00:00.000Z'),
      ),
    ).resolves.toEqual({ items: [] });

    expect(deps.receivableRepo.findOverdueCandidates).not.toHaveBeenCalled();
    expect(
      deps.disputeRepo.findOpenDisputesByReceivableIds,
    ).not.toHaveBeenCalled();
  });

  it('applies the requested limit to the returned items', async () => {
    const first = receivable({
      id: 'rec-1',
      originalAmount: 1_000_000,
      dueDate: '2026-11-18T00:00:00.000Z',
    });
    const second = receivable({
      id: 'rec-2',
      originalAmount: 1_000_000,
      dueDate: '2026-11-19T00:00:00.000Z',
    });
    const { tool, deps } = buildTool({
      receivableRepo: {
        findOverdueCandidates: jest.fn().mockResolvedValue([first, second]),
        findByIds: jest.fn().mockResolvedValue(new Map()),
      },
    });

    const result = await tool.execute(
      { limit: 1 },
      new Date('2026-11-22T00:00:00.000Z'),
    );

    expect(result.items.map((item) => item.receivableId)).toEqual(['rec-1']);
    expect(
      deps.receivableRepo.findOverdueCandidates.mock.calls[0][0].limit,
    ).toBeGreaterThanOrEqual(1);
  });
});
