import { CustomerGroup } from '../../modules/customers/domain/customer-group';

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
      name: 'Công ty TNHH Seed An Phát',
      taxCode: '0seed0001',
      email: 'anphat@seed.local',
      phone: '0900000001',
      defaultPaymentTermDays: 30,
      creditLimit: 200_000_000,
      priority: 1,
      customerGroup: CustomerGroup.VIP,
    },
    {
      name: 'Công ty TNHH Seed Bình Minh',
      taxCode: '0seed0002',
      email: 'binhminh@seed.local',
      phone: '0900000002',
      defaultPaymentTermDays: 15,
      creditLimit: 100_000_000,
      priority: 2,
      customerGroup: CustomerGroup.REGULAR,
    },
    {
      name: 'Công ty TNHH Seed Cường Thịnh',
      taxCode: '0seed0003',
      email: 'cuongthinh@seed.local',
      phone: '0900000003',
      defaultPaymentTermDays: 30,
      creditLimit: 150_000_000,
      priority: 2,
      customerGroup: CustomerGroup.REGULAR,
    },
    {
      name: 'Công ty TNHH Seed Đại Nam',
      taxCode: '0seed0004',
      email: 'dainam@seed.local',
      phone: '0900000004',
      defaultPaymentTermDays: 45,
      creditLimit: 300_000_000,
      priority: 1,
      customerGroup: CustomerGroup.VIP,
    },
  ];
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

export function buildSeedReceivablePlans(
  now: Date,
  customerCount: number,
): SeedReceivablePlan[] {
  const plans: Array<Omit<SeedReceivablePlan, 'customerIndex'>> = [
    {
      originalAmount: 15_000_000,
      dueDate: daysFrom(now, 30),
      outcome: 'OPEN',
      paymentAmount: 0,
    },
    {
      originalAmount: 8_000_000,
      dueDate: daysFrom(now, 45),
      outcome: 'OPEN',
      paymentAmount: 0,
    },
    {
      originalAmount: 12_000_000,
      dueDate: daysFrom(now, -10),
      outcome: 'OPEN_OVERDUE',
      paymentAmount: 0,
    },
    {
      originalAmount: 20_000_000,
      dueDate: daysFrom(now, -3),
      outcome: 'OPEN_OVERDUE',
      paymentAmount: 0,
    },
    {
      originalAmount: 25_000_000,
      dueDate: daysFrom(now, 15),
      outcome: 'PARTIALLY_PAID',
      paymentAmount: 10_000_000,
    },
    {
      originalAmount: 18_000_000,
      dueDate: daysFrom(now, 20),
      outcome: 'PARTIALLY_PAID',
      paymentAmount: 5_000_000,
    },
    {
      originalAmount: 9_000_000,
      dueDate: daysFrom(now, -5),
      outcome: 'PAID',
      paymentAmount: 9_000_000,
    },
    {
      originalAmount: 30_000_000,
      dueDate: daysFrom(now, -1),
      outcome: 'PAID',
      paymentAmount: 30_000_000,
    },
  ];

  return plans.map((plan, index) => ({
    ...plan,
    customerIndex: index % customerCount,
  }));
}
