import { ReceivableStatus } from '@casso-ar/shared-types';
import type { Page } from '@playwright/test';
import type { Customer } from '../../src/features/customers/types';
import type { PendingReviewItem } from '../../src/features/exceptions/types';
import type { Receivable } from '../../src/features/receivables/types';
import type { ReminderExecution } from '../../src/features/reminders/types';

const CREATED_AT = '2026-10-06T09:00:00.000Z';
export const LONG_CUSTOMER_NAMES = [1, 2, 3].map(
  (index) =>
    `${'Công ty TNHH Hợp tác phát triển thương mại An Phúc Thịnh '.repeat(5)}${index}`,
);

const customers: Customer[] = LONG_CUSTOMER_NAMES.map((name, index) => ({
  id: `viewport-customer-${index + 1}`,
  name,
  taxCode: `010000000${index + 1}`,
  email: `customer-${index + 1}@example.test`,
  phone: `090000000${index + 1}`,
  defaultPaymentTermDays: 30,
  creditLimit: 100_000_000,
  priority: index + 1,
  createdAt: CREATED_AT,
}));

const receivables: Receivable[] = customers.map((customer, index) => ({
  id: `viewport-receivable-${index + 1}`,
  customerId: customer.id,
  customerName: customer.name,
  invoiceId: null,
  invoiceNumber: `VIEW-${index + 1}`,
  originalAmount: 1_000_000,
  paidAmount: 0,
  remainingAmount: 1_000_000,
  dueDate: '2026-10-20',
  status: ReceivableStatus.OPEN,
  isDisputed: false,
  disputeId: null,
  isOverdue: false,
  salesRepresentativeId: null,
  createdAt: CREATED_AT,
  closedAt: null,
}));

const exceptions: PendingReviewItem[] = customers.map((customer, index) => ({
  transaction: {
    id: `viewport-transaction-${index + 1}`,
    providerTransactionId: `viewport-provider-${index + 1}`,
    amount: 1_000_000,
    transactionDateTime: CREATED_AT,
    counterpartyAccountNumber: null,
    counterpartyName: customer.name,
    transferContent: `Thanh toan hoa don VIEW-${index + 1}`,
    status: 'PENDING_REVIEW',
    version: 1,
    createdAt: CREATED_AT,
  },
  topCandidate: null,
  isAmbiguous: false,
  aiRecommendation: null,
  payer: {
    accountNumberMasked: '********1234',
    name: customer.name,
    linkedCustomers: [],
  },
}));

const reminderExecutions: ReminderExecution[] = customers.map(
  (customer, index) => ({
    id: `viewport-reminder-execution-${index + 1}`,
    receivableId: receivables[index].id,
    reminderRuleId: null,
    status: 'SENT',
    sentAt: CREATED_AT,
    skipReason: null,
    providerMessageId: `viewport-message-${index + 1}`,
    invoiceNumber: `VIEW-${index + 1}`,
    customerName: customer.name,
  }),
);

const authenticatedUser = {
  id: 'viewport-user',
  email: 'viewport@example.test',
  name: 'Viewport Test User',
  avatarUrl: null,
  role: 'OWNER',
  organizationId: 'viewport-organization',
  organizationName: 'Viewport Test Organization',
  subscriptionPlan: 'FREE',
  bankingLinked: false,
};

export async function installDataTableApiFixture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('casso:has-session', '1');
  });

  await page.route('**/api/v1/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    let body: unknown;

    switch (pathname) {
      case '/api/v1/auth/refresh':
        body = { accessToken: 'viewport-test-access-token' };
        break;
      case '/api/v1/auth/me':
        body = authenticatedUser;
        break;
      case '/api/v1/customers':
        body = {
          items: customers,
          total: customers.length,
          page: 1,
          limit: 20,
        };
        break;
      case '/api/v1/receivables':
        body = {
          items: receivables,
          total: receivables.length,
          page: 1,
          limit: 20,
        };
        break;
      case '/api/v1/bank-transactions/unmatched':
        body = {
          items: exceptions,
          total: exceptions.length,
          page: 1,
          limit: 20,
        };
        break;
      case '/api/v1/reminder-policies':
        body = [];
        break;
      case '/api/v1/reminder-executions':
        body = { items: reminderExecutions, total: reminderExecutions.length };
        break;
      default:
        await route.fulfill({
          status: 404,
          json: { message: 'Fixture route not found' },
        });
        return;
    }

    await route.fulfill({ status: 200, json: body });
  });
}
