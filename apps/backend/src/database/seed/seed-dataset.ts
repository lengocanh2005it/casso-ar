import { CustomerGroup } from '../../modules/customers/domain/customer-group';
import {
  type InvoiceSourceType,
  InvoiceStatus,
} from '../../modules/invoices/domain/invoice';
import type { BankTransactionStatus } from '../../modules/webhooks/domain/bank-transaction';

export interface SeedCustomerPlan {
  name: string;
  taxCode: string;
  email: string;
  phone: string;
  defaultPaymentTermDays: number;
  creditLimit: number;
  priority: number;
  customerGroup: CustomerGroup;
}

export function buildSeedCustomers(): SeedCustomerPlan[] {
  return [
    {
      name: 'Công ty TNHH Thương mại An Phát',
      taxCode: '0seed0001',
      email: 'anphat@seed.local',
      phone: '0900000001',
      defaultPaymentTermDays: 30,
      creditLimit: 500_000_000,
      priority: 1,
      customerGroup: CustomerGroup.VIP,
    },
    {
      name: 'Công ty CP Bình Minh Group',
      taxCode: '0seed0002',
      email: 'binhminh@seed.local',
      phone: '0900000002',
      defaultPaymentTermDays: 15,
      creditLimit: 200_000_000,
      priority: 2,
      customerGroup: CustomerGroup.REGULAR,
    },
    {
      name: 'Doanh nghiệp Cường Thịnh',
      taxCode: '0seed0003',
      email: 'cuongthinh@seed.local',
      phone: '0900000003',
      defaultPaymentTermDays: 45,
      creditLimit: 300_000_000,
      priority: 1,
      customerGroup: CustomerGroup.VIP,
    },
    {
      name: 'Tổng công ty Đại Nam',
      taxCode: '0seed0004',
      email: 'dainam@seed.local',
      phone: '0900000004',
      defaultPaymentTermDays: 30,
      creditLimit: 800_000_000,
      priority: 1,
      customerGroup: CustomerGroup.VIP,
    },
    {
      name: 'Công ty TNHH Én Vàng',
      taxCode: '0seed0005',
      email: 'envang@seed.local',
      phone: '0900000005',
      defaultPaymentTermDays: 20,
      creditLimit: 150_000_000,
      priority: 3,
      customerGroup: CustomerGroup.REGULAR,
    },
    {
      name: 'Công ty CP Phúc Đức',
      taxCode: '0seed0006',
      email: 'phucduc@seed.local',
      phone: '0900000006',
      defaultPaymentTermDays: 30,
      creditLimit: 250_000_000,
      priority: 2,
      customerGroup: CustomerGroup.REGULAR,
    },
    {
      name: 'Hợp tác xã Nông nghiệp Sông Mã',
      taxCode: '0seed0007',
      email: 'songma@seed.local',
      phone: '0900000007',
      defaultPaymentTermDays: 10,
      creditLimit: 80_000_000,
      priority: 3,
      customerGroup: CustomerGroup.REGULAR,
    },
    {
      name: 'Công ty TNHH Đầu tư Hạ tầng PinkCity',
      taxCode: '0seed0008',
      email: 'pinkcity@seed.local',
      phone: '0900000008',
      defaultPaymentTermDays: 60,
      creditLimit: 1_000_000_000,
      priority: 1,
      customerGroup: CustomerGroup.VIP,
    },
    {
      name: 'Công ty TNHH Dịch vụ Vận tải Hòa Bình',
      taxCode: '0seed0009',
      email: 'hoabinh@seed.local',
      phone: '0900000009',
      defaultPaymentTermDays: 15,
      creditLimit: 120_000_000,
      priority: 3,
      customerGroup: CustomerGroup.REGULAR,
    },
    {
      name: 'Công ty CP Giáo dục SmartKids',
      taxCode: '0seed0010',
      email: 'smartkids@seed.local',
      phone: '0900000010',
      defaultPaymentTermDays: 30,
      creditLimit: 180_000_000,
      priority: 2,
      customerGroup: CustomerGroup.REGULAR,
    },
  ];
}

export const SEED_OPERATOR_EMAIL = 'operator@seed.local';
export const SEED_OPERATOR_PASSWORD = 'SeedOperator123!';

export interface SeedOperatorUserProps {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt: Date;
  isOperator: true;
  createdAt: Date;
}

export function buildSeedOperatorUserProps(
  id: string,
  passwordHash: string,
  now: Date,
): SeedOperatorUserProps {
  return {
    id,
    name: 'Seed Operator',
    email: SEED_OPERATOR_EMAIL,
    passwordHash,
    emailVerifiedAt: now,
    isOperator: true,
    createdAt: now,
  };
}

export type SeedReceivableOutcome =
  | 'OPEN'
  | 'OPEN_OVERDUE'
  | 'PARTIALLY_PAID'
  | 'PAID';

export interface SeedReceivablePlan {
  customerIndex: number;
  originalAmount: number;
  dueDate: Date;
  outcome: SeedReceivableOutcome;
  paymentAmount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysFrom(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

function monthsAgo(now: Date, months: number): Date {
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return d;
}

function randomAmount(min: number, max: number, seed: number): number {
  const x = Math.sin(seed) * 10000;
  const ratio = x - Math.floor(x);
  return Math.round((min + ratio * (max - min)) / 1_000_000) * 1_000_000;
}

export function buildSeedReceivablePlans(
  now: Date,
  customerCount: number,
): SeedReceivablePlan[] {
  const plans: Array<Omit<SeedReceivablePlan, 'customerIndex'>> = [
    // ── Current month (month 0) ──────────────────────────────
    // Future — OPEN
    {
      originalAmount: 45_000_000,
      dueDate: daysFrom(now, 7),
      outcome: 'OPEN',
      paymentAmount: 0,
    },
    {
      originalAmount: 12_500_000,
      dueDate: daysFrom(now, 14),
      outcome: 'OPEN',
      paymentAmount: 0,
    },
    {
      originalAmount: 28_000_000,
      dueDate: daysFrom(now, 21),
      outcome: 'OPEN',
      paymentAmount: 0,
    },
    {
      originalAmount: 8_500_000,
      dueDate: daysFrom(now, 30),
      outcome: 'OPEN',
      paymentAmount: 0,
    },
    {
      originalAmount: 62_000_000,
      dueDate: daysFrom(now, 45),
      outcome: 'OPEN',
      paymentAmount: 0,
    },
    {
      originalAmount: 3_500_000,
      dueDate: daysFrom(now, 60),
      outcome: 'OPEN',
      paymentAmount: 0,
    },
    // Overdue — OPEN_OVERDUE
    {
      originalAmount: 18_000_000,
      dueDate: daysFrom(now, -3),
      outcome: 'OPEN_OVERDUE',
      paymentAmount: 0,
    },
    {
      originalAmount: 7_200_000,
      dueDate: daysFrom(now, -8),
      outcome: 'OPEN_OVERDUE',
      paymentAmount: 0,
    },
    {
      originalAmount: 33_000_000,
      dueDate: daysFrom(now, -15),
      outcome: 'OPEN_OVERDUE',
      paymentAmount: 0,
    },
    {
      originalAmount: 5_800_000,
      dueDate: daysFrom(now, -22),
      outcome: 'OPEN_OVERDUE',
      paymentAmount: 0,
    },
    {
      originalAmount: 41_000_000,
      dueDate: daysFrom(now, -30),
      outcome: 'OPEN_OVERDUE',
      paymentAmount: 0,
    },
    // Partially paid
    {
      originalAmount: 55_000_000,
      dueDate: daysFrom(now, 10),
      outcome: 'PARTIALLY_PAID',
      paymentAmount: 20_000_000,
    },
    {
      originalAmount: 14_500_000,
      dueDate: daysFrom(now, 5),
      outcome: 'PARTIALLY_PAID',
      paymentAmount: 6_000_000,
    },
    {
      originalAmount: 22_000_000,
      dueDate: daysFrom(now, -2),
      outcome: 'PARTIALLY_PAID',
      paymentAmount: 12_000_000,
    },
    // Fully paid — recent
    {
      originalAmount: 9_500_000,
      dueDate: daysFrom(now, -1),
      outcome: 'PAID',
      paymentAmount: 9_500_000,
    },
    {
      originalAmount: 38_000_000,
      dueDate: daysFrom(now, -4),
      outcome: 'PAID',
      paymentAmount: 38_000_000,
    },
    {
      originalAmount: 6_300_000,
      dueDate: daysFrom(now, -6),
      outcome: 'PAID',
      paymentAmount: 6_300_000,
    },

    // ── 1 month ago ──────────────────────────────────────────
    {
      originalAmount: 27_000_000,
      dueDate: monthsAgo(now, 1),
      outcome: 'PAID',
      paymentAmount: 27_000_000,
    },
    {
      originalAmount: 15_500_000,
      dueDate: monthsAgo(now, 1),
      outcome: 'PAID',
      paymentAmount: 15_500_000,
    },
    {
      originalAmount: 43_000_000,
      dueDate: monthsAgo(now, 1),
      outcome: 'PAID',
      paymentAmount: 43_000_000,
    },
    {
      originalAmount: 8_000_000,
      dueDate: monthsAgo(now, 1),
      outcome: 'PAID',
      paymentAmount: 8_000_000,
    },
    {
      originalAmount: 19_500_000,
      dueDate: monthsAgo(now, 1),
      outcome: 'PAID',
      paymentAmount: 19_500_000,
    },
    {
      originalAmount: 11_000_000,
      dueDate: monthsAgo(now, 1),
      outcome: 'PARTIALLY_PAID',
      paymentAmount: 4_000_000,
    },
    {
      originalAmount: 32_000_000,
      dueDate: monthsAgo(now, 1),
      outcome: 'PAID',
      paymentAmount: 32_000_000,
    },

    // ── 2 months ago ─────────────────────────────────────────
    {
      originalAmount: 50_000_000,
      dueDate: monthsAgo(now, 2),
      outcome: 'PAID',
      paymentAmount: 50_000_000,
    },
    {
      originalAmount: 13_500_000,
      dueDate: monthsAgo(now, 2),
      outcome: 'PAID',
      paymentAmount: 13_500_000,
    },
    {
      originalAmount: 24_000_000,
      dueDate: monthsAgo(now, 2),
      outcome: 'PAID',
      paymentAmount: 24_000_000,
    },
    {
      originalAmount: 7_500_000,
      dueDate: monthsAgo(now, 2),
      outcome: 'PAID',
      paymentAmount: 7_500_000,
    },
    {
      originalAmount: 36_000_000,
      dueDate: monthsAgo(now, 2),
      outcome: 'PAID',
      paymentAmount: 36_000_000,
    },
    {
      originalAmount: 9_000_000,
      dueDate: monthsAgo(now, 2),
      outcome: 'PAID',
      paymentAmount: 9_000_000,
    },
    {
      originalAmount: 16_500_000,
      dueDate: monthsAgo(now, 2),
      outcome: 'PARTIALLY_PAID',
      paymentAmount: 10_000_000,
    },

    // ── 3 months ago ─────────────────────────────────────────
    {
      originalAmount: 40_000_000,
      dueDate: monthsAgo(now, 3),
      outcome: 'PAID',
      paymentAmount: 40_000_000,
    },
    {
      originalAmount: 21_000_000,
      dueDate: monthsAgo(now, 3),
      outcome: 'PAID',
      paymentAmount: 21_000_000,
    },
    {
      originalAmount: 58_000_000,
      dueDate: monthsAgo(now, 3),
      outcome: 'PAID',
      paymentAmount: 58_000_000,
    },
    {
      originalAmount: 4_500_000,
      dueDate: monthsAgo(now, 3),
      outcome: 'PAID',
      paymentAmount: 4_500_000,
    },
    {
      originalAmount: 29_500_000,
      dueDate: monthsAgo(now, 3),
      outcome: 'PAID',
      paymentAmount: 29_500_000,
    },
    {
      originalAmount: 17_000_000,
      dueDate: monthsAgo(now, 3),
      outcome: 'PAID',
      paymentAmount: 17_000_000,
    },
    {
      originalAmount: 12_000_000,
      dueDate: monthsAgo(now, 3),
      outcome: 'PARTIALLY_PAID',
      paymentAmount: 5_000_000,
    },

    // ── 4 months ago ─────────────────────────────────────────
    {
      originalAmount: 34_000_000,
      dueDate: monthsAgo(now, 4),
      outcome: 'PAID',
      paymentAmount: 34_000_000,
    },
    {
      originalAmount: 25_500_000,
      dueDate: monthsAgo(now, 4),
      outcome: 'PAID',
      paymentAmount: 25_500_000,
    },
    {
      originalAmount: 10_000_000,
      dueDate: monthsAgo(now, 4),
      outcome: 'PAID',
      paymentAmount: 10_000_000,
    },
    {
      originalAmount: 47_000_000,
      dueDate: monthsAgo(now, 4),
      outcome: 'PAID',
      paymentAmount: 47_000_000,
    },
    {
      originalAmount: 6_000_000,
      dueDate: monthsAgo(now, 4),
      outcome: 'PAID',
      paymentAmount: 6_000_000,
    },
    {
      originalAmount: 31_000_000,
      dueDate: monthsAgo(now, 4),
      outcome: 'PAID',
      paymentAmount: 31_000_000,
    },
    {
      originalAmount: 8_500_000,
      dueDate: monthsAgo(now, 4),
      outcome: 'OPEN_OVERDUE',
      paymentAmount: 0,
    },

    // ── 5 months ago ─────────────────────────────────────────
    {
      originalAmount: 20_000_000,
      dueDate: monthsAgo(now, 5),
      outcome: 'PAID',
      paymentAmount: 20_000_000,
    },
    {
      originalAmount: 37_500_000,
      dueDate: monthsAgo(now, 5),
      outcome: 'PAID',
      paymentAmount: 37_500_000,
    },
    {
      originalAmount: 14_000_000,
      dueDate: monthsAgo(now, 5),
      outcome: 'PAID',
      paymentAmount: 14_000_000,
    },
    {
      originalAmount: 52_000_000,
      dueDate: monthsAgo(now, 5),
      outcome: 'PAID',
      paymentAmount: 52_000_000,
    },
    {
      originalAmount: 3_000_000,
      dueDate: monthsAgo(now, 5),
      outcome: 'PAID',
      paymentAmount: 3_000_000,
    },
    {
      originalAmount: 23_500_000,
      dueDate: monthsAgo(now, 5),
      outcome: 'PAID',
      paymentAmount: 23_500_000,
    },
    {
      originalAmount: 11_500_000,
      dueDate: monthsAgo(now, 5),
      outcome: 'PAID',
      paymentAmount: 11_500_000,
    },
    {
      originalAmount: 28_000_000,
      dueDate: monthsAgo(now, 5),
      outcome: 'PARTIALLY_PAID',
      paymentAmount: 15_000_000,
    },
  ];

  return plans.map((plan, index) => ({
    ...plan,
    customerIndex: index % customerCount,
  }));
}

// ── Disputed receivables ─────────────────────────────────────────
// These are OPEN receivables that will have disputes opened on them.
export type SeedDisputedReceivablePlan = SeedReceivablePlan;

export function buildSeedDisputedReceivablePlans(
  now: Date,
  customerCount: number,
): SeedDisputedReceivablePlan[] {
  const plans: Array<Omit<SeedDisputedReceivablePlan, 'customerIndex'>> = [
    {
      originalAmount: 15_000_000,
      dueDate: daysFrom(now, -5),
      outcome: 'OPEN',
      paymentAmount: 0,
    },
    {
      originalAmount: 8_500_000,
      dueDate: daysFrom(now, -12),
      outcome: 'OPEN',
      paymentAmount: 0,
    },
    {
      originalAmount: 22_000_000,
      dueDate: monthsAgo(now, 1),
      outcome: 'OPEN',
      paymentAmount: 0,
    },
    {
      originalAmount: 6_300_000,
      dueDate: monthsAgo(now, 2),
      outcome: 'OPEN',
      paymentAmount: 0,
    },
    {
      originalAmount: 31_000_000,
      dueDate: monthsAgo(now, 3),
      outcome: 'OPEN',
      paymentAmount: 0,
    },
    {
      originalAmount: 4_800_000,
      dueDate: monthsAgo(now, 4),
      outcome: 'OPEN',
      paymentAmount: 0,
    },
    {
      originalAmount: 19_200_000,
      dueDate: monthsAgo(now, 5),
      outcome: 'OPEN',
      paymentAmount: 0,
    },
  ];

  return plans.map((plan, index) => ({
    ...plan,
    customerIndex: index % customerCount,
  }));
}

// ── Invoices ─────────────────────────────────────────────────────
export interface SeedInvoicePlan {
  customerIndex: number;
  receivableIndex: number;
  invoiceNumber: string;
  issueDate: Date;
  totalAmount: number;
  taxAmount: number;
  sourceType: InvoiceSourceType;
  status: InvoiceStatus;
}

export function buildSeedInvoicePlans(
  now: Date,
  receivableCount: number,
  customerCount: number,
): SeedInvoicePlan[] {
  const plans: Array<
    Omit<SeedInvoicePlan, 'customerIndex' | 'receivableIndex'>
  > = [
    {
      invoiceNumber: 'INV-2026-001',
      issueDate: monthsAgo(now, 5),
      totalAmount: 20_000_000,
      taxAmount: 2_000_000,
      sourceType: 'MANUAL',
      status: InvoiceStatus.ISSUED,
    },
    {
      invoiceNumber: 'INV-2026-002',
      issueDate: monthsAgo(now, 5),
      totalAmount: 37_500_000,
      taxAmount: 3_750_000,
      sourceType: 'MANUAL',
      status: InvoiceStatus.ISSUED,
    },
    {
      invoiceNumber: 'INV-2026-003',
      issueDate: monthsAgo(now, 4),
      totalAmount: 34_000_000,
      taxAmount: 3_400_000,
      sourceType: 'IMPORT',
      status: InvoiceStatus.ISSUED,
    },
    {
      invoiceNumber: 'INV-2026-004',
      issueDate: monthsAgo(now, 4),
      totalAmount: 47_000_000,
      taxAmount: 4_700_000,
      sourceType: 'MANUAL',
      status: InvoiceStatus.ISSUED,
    },
    {
      invoiceNumber: 'INV-2026-005',
      issueDate: monthsAgo(now, 3),
      totalAmount: 40_000_000,
      taxAmount: 4_000_000,
      sourceType: 'MANUAL',
      status: InvoiceStatus.ISSUED,
    },
    {
      invoiceNumber: 'INV-2026-006',
      issueDate: monthsAgo(now, 3),
      totalAmount: 58_000_000,
      taxAmount: 5_800_000,
      sourceType: 'API',
      status: InvoiceStatus.ISSUED,
    },
    {
      invoiceNumber: 'INV-2026-007',
      issueDate: monthsAgo(now, 2),
      totalAmount: 50_000_000,
      taxAmount: 5_000_000,
      sourceType: 'MANUAL',
      status: InvoiceStatus.ISSUED,
    },
    {
      invoiceNumber: 'INV-2026-008',
      issueDate: monthsAgo(now, 2),
      totalAmount: 36_000_000,
      taxAmount: 3_600_000,
      sourceType: 'MANUAL',
      status: InvoiceStatus.ISSUED,
    },
    {
      invoiceNumber: 'INV-2026-009',
      issueDate: monthsAgo(now, 1),
      totalAmount: 27_000_000,
      taxAmount: 2_700_000,
      sourceType: 'IMPORT',
      status: InvoiceStatus.ISSUED,
    },
    {
      invoiceNumber: 'INV-2026-010',
      issueDate: monthsAgo(now, 1),
      totalAmount: 43_000_000,
      taxAmount: 4_300_000,
      sourceType: 'MANUAL',
      status: InvoiceStatus.ISSUED,
    },
    {
      invoiceNumber: 'INV-2026-011',
      issueDate: now,
      totalAmount: 55_000_000,
      taxAmount: 5_500_000,
      sourceType: 'MANUAL',
      status: InvoiceStatus.ISSUED,
    },
    {
      invoiceNumber: 'INV-2026-012',
      issueDate: now,
      totalAmount: 14_500_000,
      taxAmount: 1_450_000,
      sourceType: 'MANUAL',
      status: InvoiceStatus.ISSUED,
    },
    {
      invoiceNumber: 'INV-2026-013',
      issueDate: now,
      totalAmount: 9_500_000,
      taxAmount: 950_000,
      sourceType: 'API',
      status: InvoiceStatus.ISSUED,
    },
    {
      invoiceNumber: 'INV-2026-014',
      issueDate: now,
      totalAmount: 45_000_000,
      taxAmount: 4_500_000,
      sourceType: 'MANUAL',
      status: InvoiceStatus.DRAFT,
    },
    {
      invoiceNumber: 'INV-2026-015',
      issueDate: monthsAgo(now, 1),
      totalAmount: 19_500_000,
      taxAmount: 1_950_000,
      sourceType: 'MANUAL',
      status: InvoiceStatus.ISSUED,
    },
    {
      invoiceNumber: 'INV-2026-016',
      issueDate: monthsAgo(now, 2),
      totalAmount: 13_500_000,
      taxAmount: 1_350_000,
      sourceType: 'MANUAL',
      status: InvoiceStatus.CANCELLED,
    },
    {
      invoiceNumber: 'INV-2026-017',
      issueDate: monthsAgo(now, 3),
      totalAmount: 21_000_000,
      taxAmount: 2_100_000,
      sourceType: 'MANUAL',
      status: InvoiceStatus.ISSUED,
    },
    {
      invoiceNumber: 'INV-2026-018',
      issueDate: now,
      totalAmount: 62_000_000,
      taxAmount: 6_200_000,
      sourceType: 'MANUAL',
      status: InvoiceStatus.DRAFT,
    },
  ];

  return plans.map((plan, index) => ({
    ...plan,
    customerIndex: index % customerCount,
    receivableIndex: index % receivableCount,
  }));
}

// ── Bank transactions ────────────────────────────────────────────
export interface SeedBankTransactionPlan {
  amount: number;
  transactionDateTime: Date;
  counterpartyAccountNumber: string;
  counterpartyName: string;
  transferContent: string;
  status: BankTransactionStatus;
}

export function buildSeedBankTransactionPlans(
  now: Date,
): SeedBankTransactionPlan[] {
  const statuses: BankTransactionStatus[] = [
    'MATCHED',
    'MATCHED',
    'MATCHED',
    'MATCHED',
    'MATCHED',
    'UNMATCHED',
    'UNMATCHED',
    'UNMATCHED',
    'UNMATCHED',
    'UNMATCHED',
    'UNMATCHED',
    'UNMATCHED',
    'IGNORED',
    'IGNORED',
    'IGNORED',
    'PREPAID',
    'PREPAID',
    'PENDING_REVIEW',
    'PENDING_REVIEW',
    'PENDING_REVIEW',
  ];

  const counterparties = [
    { name: 'Công ty TNHH Thương mại An Phát', account: '1234567890' },
    { name: 'Công ty CP Bình Minh Group', account: '2345678901' },
    { name: 'Doanh nghiệp Cường Thịnh', account: '3456789012' },
    { name: 'Tổng công ty Đại Nam', account: '4567890123' },
    { name: 'Công ty TNHH Én Vàng', account: '5678901234' },
    { name: 'Công ty CP Phúc Đức', account: '6789012345' },
    { name: 'Hợp tác xã Nông nghiệp Sông Mã', account: '7890123456' },
    { name: 'Công ty TNHH Đầu tư Hạ tầng PinkCity', account: '8901234567' },
    { name: 'Công ty TNHH Dịch vụ Vận tải Hòa Bình', account: '9012345678' },
    { name: 'Công ty CP Giáo dục SmartKids', account: '0123456789' },
  ];

  const transferContents = [
    'Thanh toán hóa đơn',
    'Chuyển khoản theo hợp đồng',
    'Đợt thanh toán 1',
    'Đợt thanh toán 2',
    'Thanh toán tiền hàng',
    'Chi phí dịch vụ',
    'Thanh toán tiền thuê',
    'Phí vận chuyển',
    'Đặt cọc hợp đồng',
    'Hoàn trả tiền thừa',
  ];

  const plans: SeedBankTransactionPlan[] = [];
  for (let i = 0; i < 35; i++) {
    const monthOffset = Math.floor(i / 6);
    const cp = counterparties[i % counterparties.length];
    const amount = randomAmount(2_000_000, 60_000_000, i + 200);
    const dt = new Date(now.getTime());
    dt.setMonth(dt.getMonth() - monthOffset);
    dt.setDate(Math.floor(randomAmount(1, 28, i + 300)));

    plans.push({
      amount,
      transactionDateTime: dt,
      counterpartyAccountNumber: cp.account,
      counterpartyName: cp.name,
      transferContent: `${transferContents[i % transferContents.length]} #${1000 + i}`,
      status: statuses[i % statuses.length],
    });
  }
  return plans;
}

// ── Email templates ──────────────────────────────────────────────
export interface SeedEmailTemplatePlan {
  name: string;
  subject: string;
  bodyHtml: string;
  reminderStage: string | null;
  isDefault: boolean;
}

export function buildSeedEmailTemplatePlans(): SeedEmailTemplatePlan[] {
  return [
    {
      name: 'Invoice Reminder',
      subject: 'Nhắc thanh toán hóa đơn {{invoiceNumber}}',
      bodyHtml:
        '<p>Kính gửi {{customerName}},</p>' +
        '<p>Hóa đơn {{invoiceNumber}} với số tiền {{remainingAmount}} sẽ đến hạn vào {{dueDate}}. Vui lòng thanh toán đúng hạn.</p>' +
        '<p>Trân trọng,<br/>{{organizationName}}</p>',
      reminderStage: 'pre-due',
      isDefault: false,
    },
    {
      name: 'Payment Confirmation',
      subject: 'Xác nhận thanh toán {{invoiceNumber}}',
      bodyHtml:
        '<p>Kính gửi {{customerName}},</p>' +
        '<p>Chúng tôi đã nhận được thanh toán {{paidAmount}} cho hóa đơn {{invoiceNumber}}. Số tiền còn lại là {{remainingAmount}}.</p>' +
        '<p>Trân trọng,<br/>{{organizationName}}</p>',
      reminderStage: null,
      isDefault: false,
    },
    {
      name: 'Overdue Notice',
      subject: 'Thông báo quá hạn: Hóa đơn {{invoiceNumber}}',
      bodyHtml:
        '<p>Kính gửi {{customerName}},</p>' +
        '<p>Hóa đơn {{invoiceNumber}} đã quá hạn {{daysOverdue}} ngày với số tiền {{remainingAmount}}. Vui lòng thanh toán ngay.</p>' +
        '<p>Trân trọng,<br/>{{organizationName}}</p>',
      reminderStage: 'overdue-1',
      isDefault: false,
    },
    {
      name: 'Welcome',
      subject: 'Chào mừng {{customerName}} đến với {{organizationName}}',
      bodyHtml:
        '<p>Kính gửi {{customerName}},</p>' +
        '<p>Cảm ơn bạn đã sử dụng dịch vụ của {{organizationName}}. Nếu có thắc mắc, vui lòng liên hệ chúng tôi.</p>' +
        '<p>Trân trọng,<br/>{{organizationName}}</p>',
      reminderStage: null,
      isDefault: false,
    },
    {
      name: 'Monthly Statement',
      subject: 'Bảng kê tháng {{month}} - {{customerName}}',
      bodyHtml:
        '<p>Kính gửi {{customerName}},</p>' +
        '<p>Đây là bảng kê giao dịch tháng {{month}}. Tổng số phát sinh: {{totalAmount}}. Số tiền đã thanh toán: {{paidAmount}}. Số tiền còn nợ: {{remainingAmount}}.</p>' +
        '<p>Trân trọng,<br/>{{organizationName}}</p>',
      reminderStage: null,
      isDefault: false,
    },
    {
      name: 'Payment Receipt',
      subject: 'Biên lai thanh toán #{{receiptNumber}}',
      bodyHtml:
        '<p>Kính gửi {{customerName}},</p>' +
        '<p>Biên lai thanh toán số {{receiptNumber}} ngày {{paymentDate}} với số tiền {{paidAmount}} đã được xác nhận.</p>' +
        '<p>Trân trọng,<br/>{{organizationName}}</p>',
      reminderStage: null,
      isDefault: false,
    },
  ];
}

// ── Reminder policies & rules ────────────────────────────────────
export interface SeedReminderPolicyPlan {
  customerGroup: CustomerGroup;
  isActive: boolean;
  escalationThresholdDays: number;
  rules: Array<{
    offsetDays: number;
    emailTemplateIndex: number;
    minIntervalDays: number;
  }>;
}

export function buildSeedReminderPolicyPlans(): SeedReminderPolicyPlan[] {
  return [
    {
      customerGroup: CustomerGroup.VIP,
      isActive: true,
      escalationThresholdDays: 45,
      rules: [
        { offsetDays: -3, emailTemplateIndex: 0, minIntervalDays: 0 },
        { offsetDays: 1, emailTemplateIndex: 2, minIntervalDays: 1 },
        { offsetDays: 7, emailTemplateIndex: 2, minIntervalDays: 5 },
        { offsetDays: 30, emailTemplateIndex: 2, minIntervalDays: 14 },
      ],
    },
    {
      customerGroup: CustomerGroup.REGULAR,
      isActive: true,
      escalationThresholdDays: 30,
      rules: [
        { offsetDays: -1, emailTemplateIndex: 0, minIntervalDays: 0 },
        { offsetDays: 1, emailTemplateIndex: 2, minIntervalDays: 1 },
        { offsetDays: 7, emailTemplateIndex: 2, minIntervalDays: 5 },
      ],
    },
  ];
}
