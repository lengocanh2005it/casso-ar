import { CustomerGroup } from '../../modules/customers/domain/customer-group';
import {
  closing,
  detailCard,
  detailRow,
  emailShell,
  greeting,
  paragraph,
} from '../../modules/email-templates/application/seed-default-email-templates';
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
      name: 'Công ty TNHH Phân phối Minh Phát',
      taxCode: '0319999001',
      email: 'ketoan@minhphat.test',
      phone: '0903124501',
      defaultPaymentTermDays: 30,
      creditLimit: 500_000_000,
      priority: 1,
      customerGroup: CustomerGroup.VIP,
    },
    {
      name: 'Công ty CP Nội thất An Khang',
      taxCode: '0109999002',
      email: 'congno@ankhang.test',
      phone: '0914235602',
      defaultPaymentTermDays: 20,
      creditLimit: 240_000_000,
      priority: 2,
      customerGroup: CustomerGroup.REGULAR,
    },
    {
      name: 'Công ty TNHH Công nghệ Sao Việt',
      taxCode: '0409999003',
      email: 'finance@saoviet.test',
      phone: '0938346703',
      defaultPaymentTermDays: 45,
      creditLimit: 650_000_000,
      priority: 1,
      customerGroup: CustomerGroup.VIP,
    },
    {
      name: 'Công ty CP Xây dựng Nam Việt',
      taxCode: '0609999004',
      email: 'ketoan@namviet.test',
      phone: '0975457804',
      defaultPaymentTermDays: 30,
      creditLimit: 420_000_000,
      priority: 2,
      customerGroup: CustomerGroup.REGULAR,
    },
    {
      name: 'Công ty TNHH Dược phẩm Tâm An',
      taxCode: '0309999005',
      email: 'muahang@tamanpharma.test',
      phone: '0986568905',
      defaultPaymentTermDays: 15,
      creditLimit: 350_000_000,
      priority: 1,
      customerGroup: CustomerGroup.VIP,
    },
    {
      name: 'Công ty CP Thực phẩm Hương Việt',
      taxCode: '0119999006',
      email: 'thanhtoan@huongviet.test',
      phone: '0907679106',
      defaultPaymentTermDays: 30,
      creditLimit: 280_000_000,
      priority: 2,
      customerGroup: CustomerGroup.REGULAR,
    },
    {
      name: 'Hợp tác xã Nông nghiệp Đồng Tâm',
      taxCode: '2809999007',
      email: 'tckt.dongtam@dongtam.test',
      phone: '0918781207',
      defaultPaymentTermDays: 12,
      creditLimit: 120_000_000,
      priority: 3,
      customerGroup: CustomerGroup.REGULAR,
    },
    {
      name: 'Công ty TNHH Vận tải Bắc Nam',
      taxCode: '0109999008',
      email: 'congno@bacnamlogistics.test',
      phone: '0939892308',
      defaultPaymentTermDays: 15,
      creditLimit: 180_000_000,
      priority: 2,
      customerGroup: CustomerGroup.REGULAR,
    },
    {
      name: 'Công ty CP Thiết bị Điện Đông Á',
      taxCode: '0319999009',
      email: 'finance@donga.test',
      phone: '0971903409',
      defaultPaymentTermDays: 30,
      creditLimit: 520_000_000,
      priority: 1,
      customerGroup: CustomerGroup.VIP,
    },
    {
      name: 'Công ty TNHH Giáo dục Khai Minh',
      taxCode: '0249999010',
      email: 'ketoan@khaiminh.test',
      phone: '0982014510',
      defaultPaymentTermDays: 30,
      creditLimit: 220_000_000,
      priority: 3,
      customerGroup: CustomerGroup.REGULAR,
    },
    {
      name: 'Công ty TNHH Giải pháp Kho vận Việt Trung',
      taxCode: '0319999011',
      email: 'thanhtoan@viettrunglogistics.test',
      phone: '0903125611',
      defaultPaymentTermDays: 45,
      creditLimit: 750_000_000,
      priority: 1,
      customerGroup: CustomerGroup.VIP,
    },
    {
      name: 'Công ty CP Du lịch Biển Xanh',
      taxCode: '0236999012',
      email: 'ketoan@bienxanhtravel.test',
      phone: '0914236712',
      defaultPaymentTermDays: 20,
      creditLimit: 160_000_000,
      priority: 2,
      customerGroup: CustomerGroup.REGULAR,
    },
    {
      name: 'Công ty TNHH Bao bì Tân Tiến',
      taxCode: '0209999013',
      email: 'congno@tantienpack.test',
      phone: '0938347813',
      defaultPaymentTermDays: 30,
      creditLimit: 300_000_000,
      priority: 2,
      customerGroup: CustomerGroup.REGULAR,
    },
    {
      name: 'Công ty CP Cơ khí Đại Thành',
      taxCode: '0109999014',
      email: 'finance@daithanhmechanical.test',
      phone: '0975458914',
      defaultPaymentTermDays: 60,
      creditLimit: 900_000_000,
      priority: 1,
      customerGroup: CustomerGroup.VIP,
    },
    {
      name: 'Công ty TNHH Thương mại Dịch vụ Hoàng Gia',
      taxCode: '0319999015',
      email: 'ketoan@hoanggia.test',
      phone: '0986569015',
      defaultPaymentTermDays: 15,
      creditLimit: 200_000_000,
      priority: 3,
      customerGroup: CustomerGroup.REGULAR,
    },
    {
      name: 'Công ty CP Phần mềm Mây Việt',
      taxCode: '0319999016',
      email: 'billing@mayviet.test',
      phone: '0907671216',
      defaultPaymentTermDays: 30,
      creditLimit: 480_000_000,
      priority: 2,
      customerGroup: CustomerGroup.REGULAR,
    },
  ];
}

export const SEED_OPERATOR_EMAIL = 'operator@casso.test';
export const SEED_OPERATOR_PASSWORD = 'CassoOperator123!';

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
    name: 'Nhân viên vận hành Casso',
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
    {
      originalAmount: 18_200_000,
      dueDate: daysFrom(now, 12),
      outcome: 'OPEN',
      paymentAmount: 0,
    },
    {
      originalAmount: 26_400_000,
      dueDate: daysFrom(now, -18),
      outcome: 'OPEN_OVERDUE',
      paymentAmount: 0,
    },
    {
      originalAmount: 74_000_000,
      dueDate: daysFrom(now, 20),
      outcome: 'OPEN',
      paymentAmount: 0,
    },
    {
      originalAmount: 16_500_000,
      dueDate: daysFrom(now, -10),
      outcome: 'PARTIALLY_PAID',
      paymentAmount: 5_500_000,
    },
    {
      originalAmount: 44_000_000,
      dueDate: daysFrom(now, -7),
      outcome: 'PAID',
      paymentAmount: 44_000_000,
    },
    {
      originalAmount: 12_800_000,
      dueDate: daysFrom(now, -30),
      outcome: 'PAID',
      paymentAmount: 12_800_000,
    },
    {
      originalAmount: 39_600_000,
      dueDate: daysFrom(now, -2),
      outcome: 'PARTIALLY_PAID',
      paymentAmount: 20_000_000,
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
  receivableIndex: number | null;
  invoiceNumber: string;
  issueDate: Date;
  totalAmount: number;
  taxAmount: number;
  sourceType: InvoiceSourceType;
  status: InvoiceStatus;
}

export function buildSeedInvoicePlans(
  now: Date,
  receivablePlans: SeedReceivablePlan[],
  disputedReceivablePlans: SeedDisputedReceivablePlan[],
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
    {
      invoiceNumber: 'INV-2026-019',
      issueDate: monthsAgo(now, 5),
      totalAmount: 72_000_000,
      taxAmount: 7_200_000,
      sourceType: 'API',
      status: InvoiceStatus.ISSUED,
    },
    {
      invoiceNumber: 'INV-2026-020',
      issueDate: monthsAgo(now, 5),
      totalAmount: 16_800_000,
      taxAmount: 1_680_000,
      sourceType: 'IMPORT',
      status: InvoiceStatus.ISSUED,
    },
    {
      invoiceNumber: 'INV-2026-021',
      issueDate: monthsAgo(now, 4),
      totalAmount: 29_400_000,
      taxAmount: 2_940_000,
      sourceType: 'MANUAL',
      status: InvoiceStatus.ISSUED,
    },
    {
      invoiceNumber: 'INV-2026-022',
      issueDate: monthsAgo(now, 4),
      totalAmount: 84_000_000,
      taxAmount: 8_400_000,
      sourceType: 'API',
      status: InvoiceStatus.ISSUED,
    },
    {
      invoiceNumber: 'INV-2026-023',
      issueDate: monthsAgo(now, 3),
      totalAmount: 11_200_000,
      taxAmount: 1_120_000,
      sourceType: 'MANUAL',
      status: InvoiceStatus.ISSUED,
    },
    {
      invoiceNumber: 'INV-2026-024',
      issueDate: monthsAgo(now, 3),
      totalAmount: 66_000_000,
      taxAmount: 6_600_000,
      sourceType: 'IMPORT',
      status: InvoiceStatus.ISSUED,
    },
    {
      invoiceNumber: 'INV-2026-025',
      issueDate: monthsAgo(now, 2),
      totalAmount: 18_600_000,
      taxAmount: 1_860_000,
      sourceType: 'MANUAL',
      status: InvoiceStatus.ISSUED,
    },
    {
      invoiceNumber: 'INV-2026-026',
      issueDate: monthsAgo(now, 2),
      totalAmount: 92_000_000,
      taxAmount: 9_200_000,
      sourceType: 'API',
      status: InvoiceStatus.ISSUED,
    },
    {
      invoiceNumber: 'INV-2026-027',
      issueDate: monthsAgo(now, 1),
      totalAmount: 7_800_000,
      taxAmount: 780_000,
      sourceType: 'MANUAL',
      status: InvoiceStatus.ISSUED,
    },
    {
      invoiceNumber: 'INV-2026-028',
      issueDate: monthsAgo(now, 1),
      totalAmount: 35_000_000,
      taxAmount: 3_500_000,
      sourceType: 'IMPORT',
      status: InvoiceStatus.ISSUED,
    },
    {
      invoiceNumber: 'INV-2026-029',
      issueDate: now,
      totalAmount: 24_500_000,
      taxAmount: 2_450_000,
      sourceType: 'MANUAL',
      status: InvoiceStatus.DRAFT,
    },
    {
      invoiceNumber: 'INV-2026-030',
      issueDate: now,
      totalAmount: 48_000_000,
      taxAmount: 4_800_000,
      sourceType: 'API',
      status: InvoiceStatus.CANCELLED,
    },
  ];

  const allReceivablePlans = [...receivablePlans, ...disputedReceivablePlans];
  const linkedReceivableIndexes = new Set<number>();

  return plans.map((plan, index) => {
    const receivableIndex =
      plan.status === InvoiceStatus.ISSUED
        ? allReceivablePlans.findIndex(
            (receivable, candidateIndex) =>
              !linkedReceivableIndexes.has(candidateIndex) &&
              receivable.originalAmount === plan.totalAmount,
          )
        : -1;
    if (receivableIndex >= 0) linkedReceivableIndexes.add(receivableIndex);

    return {
      ...plan,
      customerIndex:
        receivableIndex >= 0
          ? allReceivablePlans[receivableIndex].customerIndex
          : index % customerCount,
      receivableIndex: receivableIndex >= 0 ? receivableIndex : null,
    };
  });
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
    { name: 'Công ty TNHH Phân phối Minh Phát', account: '1903678214' },
    { name: 'Công ty CP Nội thất An Khang', account: '1028846173' },
    { name: 'Công ty TNHH Công nghệ Sao Việt', account: '2201457936' },
    { name: 'Công ty CP Xây dựng Nam Việt', account: '7609124835' },
    { name: 'Công ty TNHH Dược phẩm Tâm An', account: '1402678391' },
    { name: 'Công ty CP Thực phẩm Hương Việt', account: '3205987146' },
    { name: 'Hợp tác xã Nông nghiệp Đồng Tâm', account: '4901836275' },
    { name: 'Công ty TNHH Vận tải Bắc Nam', account: '6802749153' },
    { name: 'Công ty CP Thiết bị Điện Đông Á', account: '3708619245' },
    { name: 'Công ty TNHH Giáo dục Khai Minh', account: '1204938675' },
    {
      name: 'Công ty TNHH Giải pháp Kho vận Việt Trung',
      account: '8901763245',
    },
    { name: 'Công ty CP Du lịch Biển Xanh', account: '2506389147' },
    { name: 'Công ty TNHH Bao bì Tân Tiến', account: '4109273658' },
    { name: 'Công ty CP Cơ khí Đại Thành', account: '5301847962' },
    {
      name: 'Công ty TNHH Thương mại Dịch vụ Hoàng Gia',
      account: '6103758294',
    },
    { name: 'Công ty CP Phần mềm Mây Việt', account: '7302916485' },
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
  for (let i = 0; i < 60; i++) {
    const monthOffset = Math.floor(i / 10);
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
      name: 'Nhắc thanh toán hóa đơn',
      subject: 'Nhắc thanh toán hóa đơn {{invoiceNumber}}',
      bodyHtml: emailShell(
        greeting() +
          paragraph(
            'Hóa đơn <strong>{{invoiceNumber}}</strong> sẽ đến hạn vào {{dueDate}}. ' +
              'Vui lòng thanh toán đúng hạn.',
          ) +
          detailCard(
            detailRow('Số hóa đơn', '{{invoiceNumber}}') +
              detailRow('Ngày đến hạn', '{{dueDate}}') +
              detailRow('Còn phải thu', '{{remainingAmount}}', true),
          ) +
          closing(),
      ),
      reminderStage: 'pre-due',
      isDefault: false,
    },
    {
      name: 'Xác nhận thanh toán',
      subject: 'Xác nhận thanh toán {{invoiceNumber}}',
      bodyHtml: emailShell(
        greeting() +
          paragraph(
            'Chúng tôi đã ghi nhận thanh toán cho hóa đơn <strong>{{invoiceNumber}}</strong>. ' +
              'Xin Quý khách kiểm tra lại thông tin bên dưới.',
          ) +
          detailCard(
            detailRow('Số hóa đơn', '{{invoiceNumber}}') +
              detailRow('Còn phải thu', '{{remainingAmount}}', true),
          ) +
          closing(),
      ),
      reminderStage: null,
      isDefault: false,
    },
    {
      name: 'Thông báo quá hạn',
      subject: 'Thông báo quá hạn: Hóa đơn {{invoiceNumber}}',
      bodyHtml: emailShell(
        greeting() +
          paragraph(
            'Hóa đơn <strong>{{invoiceNumber}}</strong> đã quá hạn {{daysOverdue}} ngày. ' +
              'Vui lòng thanh toán ngay.',
          ) +
          detailCard(
            detailRow('Số hóa đơn', '{{invoiceNumber}}') +
              detailRow('Ngày quá hạn', '{{daysOverdue}} ngày') +
              detailRow('Còn phải thu', '{{remainingAmount}}', true),
          ) +
          closing(),
      ),
      reminderStage: 'overdue-1',
      isDefault: false,
    },
    {
      name: 'Chào mừng khách hàng',
      subject: 'Chào mừng {{customerName}} đến với {{organizationName}}',
      bodyHtml: emailShell(
        greeting() +
          paragraph(
            'Cảm ơn Quý khách đã sử dụng dịch vụ của {{organizationName}}. ' +
              'Nếu có thắc mắc, vui lòng liên hệ để được hỗ trợ.',
          ) +
          closing(),
      ),
      reminderStage: null,
      isDefault: false,
    },
    {
      name: 'Bảng kê công nợ',
      subject: 'Bảng kê công nợ {{invoiceNumber}}',
      bodyHtml: emailShell(
        greeting() +
          paragraph(
            'Dưới đây là tổng hợp công nợ của Quý khách tính đến {{dueDate}}.',
          ) +
          detailCard(
            detailRow('Số hóa đơn', '{{invoiceNumber}}') +
              detailRow('Tổng phát sinh', '{{originalAmount}}') +
              detailRow('Còn phải thu', '{{remainingAmount}}', true),
          ) +
          closing(),
      ),
      reminderStage: null,
      isDefault: false,
    },
    {
      name: 'Biên lai thanh toán',
      subject: 'Biên lai thanh toán hóa đơn {{invoiceNumber}}',
      bodyHtml: emailShell(
        greeting() +
          paragraph(
            'Biên lai thanh toán cho hóa đơn <strong>{{invoiceNumber}}</strong> đã được xác nhận.',
          ) +
          detailCard(
            detailRow('Số hóa đơn', '{{invoiceNumber}}') +
              detailRow('Ngày thanh toán', '{{dueDate}}') +
              detailRow('Số tiền còn lại', '{{remainingAmount}}', true),
          ) +
          closing(),
      ),
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
