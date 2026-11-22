import { Inject, Injectable } from '@nestjs/common';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { TenantContextService } from '../../../../common/tenancy/tenant-context';
import { REMINDER_EXECUTION_REPOSITORY } from '../../../../common/tokens/reminder-execution.token';
import type { ICustomerRepository } from '../../../customers/application/customer-repository.port';
import { CUSTOMER_REPOSITORY } from '../../../customers/application/customer-repository.port';
import type { IDisputeRepository } from '../../../disputes/application/dispute-repository.port';
import { DISPUTE_REPOSITORY } from '../../../disputes/application/dispute-repository.port';
import type { IInvoiceRepository } from '../../../invoices/application/invoice-repository.port';
import { INVOICE_REPOSITORY } from '../../../invoices/application/invoice-repository.port';
import { Role } from '../../../organizations/domain/membership';
import type { IPaymentAllocationRepository } from '../../../payments/application/payment-allocation-repository.port';
import { PAYMENT_ALLOCATION_REPOSITORY } from '../../../payments/application/payment-allocation-repository.port';
import type { IReceivableRepository } from '../../../receivables/application/receivable-repository.port';
import { RECEIVABLE_REPOSITORY } from '../../../receivables/application/receivable-repository.port';
import type { Receivable } from '../../../receivables/domain/receivable';
import type { IReminderExecutionRepository } from '../../../reminders/application/reminder-execution-repository.port';
import type { CopilotJsonSchema } from '../copilot-tool-registry';
import { validateSearchAndLimit } from './copilot-tool-input';

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
   * remainingAmount / median remaining of the customer's open receivables in
   * the candidate set. 1 means "exactly the customer's median".
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
      message: 'Số dư lớn bất thường so với các khoản cùng khách hàng',
    });
  }

  return { riskScore, riskBand, reasons };
}

export const RANK_RECEIVABLES_BY_RISK_SCHEMA: CopilotJsonSchema = {
  type: 'object',
  properties: {
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 10,
      description:
        'Maximum number of ranked receivables to return (default 10, max 10).',
    },
    search: {
      type: 'string',
      description:
        'Optional case-insensitive customer name or invoice number filter.',
    },
  },
  required: [],
};

export interface RankedReceivable {
  receivableId: string;
  customerId: string;
  customerName: string;
  invoiceNumber: string | null;
  remainingAmount: number;
  dueDate: string;
  riskScore: number;
  riskBand: RiskBand;
  reasons: RiskReason[];
}

export interface RankResult {
  items: RankedReceivable[];
}

const REPORTING_TIMEZONE = 'Asia/Ho_Chi_Minh';
const HORIZON_DAYS = 7;
const DEFAULT_LIMIT = 10;
const MAX_CANDIDATES = 30;
const CANDIDATE_FACTOR = 3;
const PAYMENT_HISTORY_LIMIT = 50;
const MS_PER_DAY = 86_400_000;

// Candidates are "overdue or due within the next 7 days in Asia/Ho_Chi_Minh",
// so the window ends at the start of the 8th local day: that keeps the whole
// seventh day inside the horizon instead of cutting it at the current
// time-of-day.
function horizonEnd(now: Date): Date {
  const localDate = formatInTimeZone(now, REPORTING_TIMEZONE, 'yyyy-MM-dd');
  const midnight = fromZonedTime(`${localDate}T00:00:00`, REPORTING_TIMEZONE);
  return new Date(midnight.getTime() + (HORIZON_DAYS + 1) * MS_PER_DAY);
}

function daysSince(date: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / MS_PER_DAY));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

@Injectable()
export class RankReceivablesByRiskTool {
  static readonly NAME = 'rankReceivablesByRisk';

  constructor(
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
    @Inject(INVOICE_REPOSITORY)
    private readonly invoiceRepo: IInvoiceRepository,
    @Inject(DISPUTE_REPOSITORY)
    private readonly disputeRepo: IDisputeRepository,
    @Inject(REMINDER_EXECUTION_REPOSITORY)
    private readonly reminderRepo: IReminderExecutionRepository,
    @Inject(PAYMENT_ALLOCATION_REPOSITORY)
    private readonly allocationRepo: IPaymentAllocationRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    input: { limit?: number; search?: string },
    now = new Date(),
  ): Promise<RankResult> {
    const limit = validateSearchAndLimit(input).limit ?? DEFAULT_LIMIT;

    const organizationId = this.tenantContext.getOrganizationId();
    const currentUser = this.tenantContext.getCurrentUser();
    const salesRepresentativeId =
      currentUser?.role === Role.SALES_REP ? currentUser.userId : undefined;

    let customerIdIn: string[] | undefined;
    let invoiceIdIn: string[] | undefined;
    const normalizedSearch =
      typeof input.search === 'string' ? input.search.trim() : '';
    if (normalizedSearch.length > 0) {
      const [customers, invoices] = await Promise.all([
        this.customerRepo.findIdsBySearch(organizationId, normalizedSearch),
        this.invoiceRepo.findIdsByInvoiceNumberSearch(
          organizationId,
          normalizedSearch,
        ),
      ]);
      if (customers.length === 0 && invoices.length === 0) return { items: [] };
      customerIdIn = customers;
      invoiceIdIn = invoices;
    }

    // ponytail: bounded candidate window (3x the result limit, max 30).
    // Upgrade to a streaming query if ranking ever needs more than top-N.
    const candidateLimit = Math.min(MAX_CANDIDATES, limit * CANDIDATE_FACTOR);
    const candidates = await this.receivableRepo.findOverdueCandidates({
      organizationId,
      referenceDate: horizonEnd(now),
      salesRepresentativeId,
      customerIdIn,
      invoiceIdIn,
      sortBy: 'due_date_asc',
      limit: candidateLimit,
    });
    if (candidates.length === 0) return { items: [] };

    const ids = candidates.map((receivable) => receivable.id);
    const customerIds = [
      ...new Set(candidates.map((receivable) => receivable.customerId)),
    ];
    const invoiceIds = [
      ...new Set(
        candidates
          .map((receivable) => receivable.invoiceId)
          .filter((id): id is string => id !== null),
      ),
    ];

    const [disputes, reminders, customersMap, invoicesMap] = await Promise.all([
      this.disputeRepo.findOpenDisputesByReceivableIds(ids),
      this.reminderRepo.findLatestSentByReceivableIds(ids),
      customerIds.length > 0
        ? this.customerRepo.findByIds(customerIds)
        : Promise.resolve(new Map()),
      invoiceIds.length > 0
        ? this.invoiceRepo.findByIds(invoiceIds)
        : Promise.resolve(new Map()),
    ]);

    // The spec's baseline is every open receivable of the customer, not the
    // bounded candidate window: with a candidate-only median a lone candidate
    // is always its own median (ratio 1 -> 5 points). ponytail: one
    // findOpenByCustomerId per distinct customer, each capped at 100 rows by
    // the port; add a batch port if the candidate fan-out ever grows past 30.
    const medianByCustomer = new Map<string, number>(
      await Promise.all(
        customerIds.map(async (customerId) => {
          const open =
            await this.receivableRepo.findOpenByCustomerId(customerId);
          return [
            customerId,
            median(open.map((receivable) => receivable.remainingAmount)),
          ] as const;
        }),
      ),
    );

    const lateRatioByCustomer = await this.loadLatePaymentRatios(customerIds);

    const ranked = candidates.map((receivable: Receivable) => {
      const customerMedian = medianByCustomer.get(receivable.customerId) ?? 0;
      const score = scoreRisk({
        daysOverdue: daysSince(receivable.dueDate, now),
        hasOpenDispute: disputes.has(receivable.id),
        hasPriorSentReminder: reminders.has(receivable.id),
        latePaymentRatio: lateRatioByCustomer.get(receivable.customerId) ?? 0,
        remainingToMedianRatio:
          customerMedian === 0
            ? 0
            : receivable.remainingAmount / customerMedian,
      });
      return {
        receivableId: receivable.id,
        customerId: receivable.customerId,
        customerName:
          customersMap.get(receivable.customerId)?.name ??
          'Khách hàng không xác định',
        invoiceNumber: receivable.invoiceId
          ? (invoicesMap.get(receivable.invoiceId)?.invoiceNumber ?? null)
          : null,
        remainingAmount: receivable.remainingAmount,
        dueDate: receivable.dueDate.toISOString(),
        ...score,
      };
    });

    ranked.sort(
      (left, right) =>
        right.riskScore - left.riskScore ||
        left.dueDate.localeCompare(right.dueDate),
    );

    return { items: ranked.slice(0, limit) };
  }

  // One query for every customer plus one batch lookup for the allocated
  // receivables: the due-date math stays in memory, so the signal never
  // degrades into a query per customer or per receivable.
  private async loadLatePaymentRatios(
    customerIds: string[],
  ): Promise<Map<string, number>> {
    const ratios = new Map<string, number>();
    if (customerIds.length === 0) return ratios;

    const allocationsByCustomer = await this.allocationRepo.findByCustomerIds(
      customerIds,
      PAYMENT_HISTORY_LIMIT,
    );

    const allocatedReceivableIds = [
      ...new Set(
        [...allocationsByCustomer.values()]
          .flat()
          .map((allocation) => allocation.receivableId),
      ),
    ];
    const allocatedReceivables =
      allocatedReceivableIds.length > 0
        ? await this.receivableRepo.findByIds(allocatedReceivableIds)
        : new Map<string, Receivable>();

    for (const customerId of customerIds) {
      const allocations = (allocationsByCustomer.get(customerId) ?? []).filter(
        (allocation) => allocation.isActive(),
      );
      let comparable = 0;
      let late = 0;
      for (const allocation of allocations) {
        const target = allocatedReceivables.get(allocation.receivableId);
        if (!target) continue;
        comparable += 1;
        if (allocation.allocatedAt.getTime() > target.dueDate.getTime()) {
          late += 1;
        }
      }
      ratios.set(customerId, comparable === 0 ? 0 : late / comparable);
    }

    return ratios;
  }
}
