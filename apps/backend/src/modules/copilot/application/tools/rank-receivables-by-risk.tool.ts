export type RiskReasonCode =
  | 'OVERDUE_DEPTH'
  | 'OPEN_DISPUTE'
  | 'REMINDER_FATIGUE'
  | 'LATE_PAYMENT_HISTORY'
  | 'LARGE_BALANCE';

export type RiskBand = 'HIGH' | 'MEDIUM' | 'LOW';

export interface RiskReason {
  code: RiskReasonCode;
  message: string;
}

export interface RiskSignals {
  daysOverdue: number;
  hasOpenDispute: boolean;
  hasPriorSentReminder: boolean;
  latePaymentRatio: number;
  /**
   * remainingAmount / median remaining of the same customer's open
   * receivables. 1 means "exactly the customer's median", so only the excess
   * above the median counts as unusually large.
   */
  remainingToMedianRatio: number;
}

export interface RiskScore {
  riskScore: number;
  riskBand: RiskBand;
  reasons: RiskReason[];
}

const MAX_OVERDUE_POINTS = 30;
const MAX_LATE_POINTS = 20;
const MAX_LARGE_POINTS = 15;
const LARGE_POINTS_PER_RATIO_UNIT = 5;
const DISPUTE_POINTS = 20;
const REMINDER_POINTS = 5;
const HIGH_BAND_MIN = 60;
const MEDIUM_BAND_MIN = 30;
const TOTAL_CAP = 100;

// +1e-9 keeps a mathematically integral ratio (e.g. 0.5 * 20) from flooring
// to one point less because of binary floating-point representation.
function proportionalPoints(
  value: number,
  perUnit: number,
  cap: number,
): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(cap, Math.floor(value * perUnit + 1e-9));
}

export function scoreRisk(signals: RiskSignals): RiskScore {
  const overduePoints = proportionalPoints(
    signals.daysOverdue,
    1 / 3,
    MAX_OVERDUE_POINTS,
  );
  const disputePoints = signals.hasOpenDispute ? DISPUTE_POINTS : 0;
  // The batch reminder port exposes only the latest SENT execution, so the
  // observable sentCount is 0 or 1 (5 points). Upgrade to a count query if
  // fatigue needs more granularity.
  const reminderPoints = signals.hasPriorSentReminder ? REMINDER_POINTS : 0;
  const latePoints = proportionalPoints(
    signals.latePaymentRatio,
    MAX_LATE_POINTS,
    MAX_LATE_POINTS,
  );
  const largePoints = proportionalPoints(
    signals.remainingToMedianRatio,
    LARGE_POINTS_PER_RATIO_UNIT,
    MAX_LARGE_POINTS,
  );

  const riskScore = Math.min(
    TOTAL_CAP,
    overduePoints + disputePoints + reminderPoints + latePoints + largePoints,
  );
  const riskBand: RiskBand =
    riskScore >= HIGH_BAND_MIN
      ? 'HIGH'
      : riskScore >= MEDIUM_BAND_MIN
        ? 'MEDIUM'
        : 'LOW';

  const reasons: RiskReason[] = [];
  if (overduePoints > 0) {
    reasons.push({
      code: 'OVERDUE_DEPTH',
      message: `Quá hạn ${Math.floor(signals.daysOverdue)} ngày`,
    });
  }
  if (disputePoints > 0) {
    reasons.push({
      code: 'OPEN_DISPUTE',
      message: 'Khoản phải thu đang có tranh chấp mở',
    });
  }
  if (reminderPoints > 0) {
    reasons.push({
      code: 'REMINDER_FATIGUE',
      message: 'Đã gửi email nhắc trước đây nhưng khoản vẫn chưa thu',
    });
  }
  if (latePoints > 0) {
    reasons.push({
      code: 'LATE_PAYMENT_HISTORY',
      message: 'Khách hàng có lịch sử thanh toán trễ',
    });
  }
  if (largePoints > 0) {
    reasons.push({
      code: 'LARGE_BALANCE',
      message: 'Số dư lớn hơn trung vị các khoản cùng khách hàng',
    });
  }

  return { riskScore, riskBand, reasons };
}
