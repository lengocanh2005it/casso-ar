import { type RiskSignals, scoreRisk } from './rank-receivables-by-risk.tool';

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
