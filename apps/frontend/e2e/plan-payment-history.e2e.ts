import {
  PlanId,
  PlanPaymentHistoryProvenance,
  PlanPaymentHistorySourceType,
  PlanPaymentReceiptOutcome,
} from '@casso-ar/shared-types';
import { expect, type Page, test } from '@playwright/test';
import { type StubApiOptions, stubApi } from './fixtures/stub-api';
import { assertMinTapTarget, openRoute } from './layout-invariants';

const PAGE_LIMIT = 20;
const totalPayments = PAGE_LIMIT + 1;

const planCatalog = [
  {
    planId: PlanId.FREE,
    priceVnd: 0,
    receivableMonthlyLimit: 50,
    bankConnectionLimit: 1,
    copilotChatMonthlyLimit: 50,
  },
  {
    planId: PlanId.STARTER,
    priceVnd: 299_000,
    receivableMonthlyLimit: 500,
    bankConnectionLimit: 2,
    copilotChatMonthlyLimit: 100,
  },
  {
    planId: PlanId.BUSINESS,
    priceVnd: 999_000,
    receivableMonthlyLimit: 5_000,
    bankConnectionLimit: 5,
    copilotChatMonthlyLimit: 1_000,
  },
  {
    planId: PlanId.ENTERPRISE,
    priceVnd: 2_999_000,
    receivableMonthlyLimit: 15_000,
    bankConnectionLimit: 10,
    copilotChatMonthlyLimit: 10_000,
  },
];

const paymentHistory = Array.from({ length: totalPayments }, (_, index) => ({
  paymentKind:
    index % 2 === 0
      ? PlanPaymentHistorySourceType.PLAN_UPGRADE_ORDER
      : PlanPaymentHistorySourceType.PERIOD_CHARGE,
  orderCode: String(1000 + index),
  planId: PlanId.BUSINESS,
  receivedAmount: 999_000,
  initialOutcome: PlanPaymentReceiptOutcome.ACCEPTED,
  provenance: PlanPaymentHistoryProvenance.PAYOS_WEBHOOK,
  confirmedAt: '2026-10-06T09:00:00.000Z',
}));

async function installBillingFixture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('casso:has-session', '1');
  });

  const routes: StubApiOptions['routes'] = {
    'v1/bank-transactions/pending-review-count': { body: { count: 0 } },
    'v1/alerts': { body: { items: [], total: 0, unreadCount: 0 } },
    'v1/alerts/stream': { status: 204, body: '' },
    'v1/plans': { body: planCatalog },
    'v1/organizations/org-1/ownership-transfers/pending-for-me': {
      body: null,
    },
    'v1/payos/payment-history': async (route) => {
      const requestUrl = new URL(route.request().url());
      const pageNumber = Number(requestUrl.searchParams.get('page') ?? '1');
      const start = (pageNumber - 1) * PAGE_LIMIT;
      const body = {
        items: paymentHistory.slice(start, start + PAGE_LIMIT),
        total: totalPayments,
        page: pageNumber,
        limit: PAGE_LIMIT,
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    },
  };

  await stubApi(page, { routes });
}

const pagerTargets = [
  'input[name="page"]',
  '[aria-label="Trang đầu"]',
  'button:has-text("Trước")',
  'button:has-text("Sau")',
  '[aria-label="Trang cuối"]',
];

async function assertPagerTargets(page: Page, minSize: number): Promise<void> {
  for (const selector of pagerTargets) {
    await assertMinTapTarget(page, selector, minSize);
  }
}

test('plan payment history pagination controls keep their viewport target size', async ({
  page,
  viewport,
}) => {
  await installBillingFixture(page);
  await openRoute(page, '/settings?tab=billing', '[aria-label="Trang cuối"]');

  const minSize = (viewport?.width ?? 0) < 1280 ? 44 : 32;
  await expect(
    page.getByText('Trang 1 / 2 · 21 khoản thanh toán'),
  ).toBeVisible();
  await assertPagerTargets(page, minSize);

  await page.getByRole('button', { name: 'Sau' }).click();
  await expect(
    page.getByText('Trang 2 / 2 · 21 khoản thanh toán'),
  ).toBeVisible();
  await assertPagerTargets(page, minSize);
});
