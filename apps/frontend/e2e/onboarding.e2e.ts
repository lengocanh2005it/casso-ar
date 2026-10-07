import { expect, type Page, test } from '@playwright/test';
import { stubSession } from './fixtures/stub-api';
import {
  assertHitTestable,
  assertInsideContainer,
  assertMinTapTarget,
  assertNoHorizontalScroll,
  openRoute,
} from './layout-invariants';

/**
 * Layout invariants for `/onboarding`, at every project width.
 *
 * The route sits behind `ProtectedRoute`, so the page is reached with a
 * stubbed session (`stubSession`) rather than a real login: the harness runs
 * without a backend.
 */
const AUTH_CARD = 'main > div > div:has(a[aria-label*="Về trang chủ"])';
const CARD_INPUT = 'input:not([type="checkbox"])';
const CARD_BUTTON = 'button';
const cardContents = (card: string) => `${card} *`;

/** WCAG 2.2 AA target size (SC 2.5.8). */
const TAP_TARGET_PX = 44;

const API_KEY_READY = '#casso-api-key';

const PREVIEW_ACCOUNTS = {
  accounts: [
    {
      accountNumber: '0071000123456',
      bankName: 'Ngân hàng Ngoại thương Việt Nam',
      accountHolderName: 'Công ty TNHH Một Bà Trăm Linh',
      status: 'AVAILABLE',
    },
    {
      accountNumber: '0071000999888',
      bankName: 'Ngân hàng Đầu tư và Phát triển Việt Nam',
      accountHolderName: 'Công ty TNHH Một Bà Trăm Linh',
      status: 'AVAILABLE',
    },
  ],
  missingAccountNumbers: [],
};

async function assertCardLayout(page: Page, card: string) {
  await assertNoHorizontalScroll(page);
  await assertInsideContainer(page, card, CARD_INPUT);
  await assertInsideContainer(page, card, CARD_BUTTON);
}

async function assertReachable(page: Page, selectors: readonly string[]) {
  for (const selector of selectors) {
    await assertHitTestable(page, selector);
    await assertMinTapTarget(page, selector, TAP_TARGET_PX);
  }
}

const stubUser = {
  id: 'user-1',
  email: 'ban@congty.com',
  name: 'Nguyễn Văn A',
  avatarUrl: null,
  role: 'OWNER',
  organizationId: 'org-1',
  organizationName: 'Công ty TNHH ABC',
  subscriptionPlan: 'BUSINESS',
  bankingLinked: false,
};

/** Registered before `openRoute` so the first paint already has the session. */
async function stubOnboarding(page: Page, user: Partial<typeof stubUser> = {}) {
  await stubSession(page, { ...stubUser, ...user });
  await page.route(/casso-flow\/preview(?:\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(PREVIEW_ACCOUNTS),
    }),
  );
}

test.describe('onboarding — account picker', () => {
  test.beforeEach(async ({ page }) => {
    await stubOnboarding(page);
    await openRoute(page, '/onboarding', API_KEY_READY);
  });

  test('never scrolls horizontally and keeps controls inside the card', async ({
    page,
  }) => {
    await assertCardLayout(page, AUTH_CARD);
  });

  test('leaves every control reachable', async ({ page }) => {
    await assertReachable(page, [
      API_KEY_READY,
      'button[aria-label="Hiện mã API Key"]',
      'button:has-text("Xem tài khoản")',
      'button:has-text("Bỏ qua, đến trang chủ")',
    ]);
  });

  test('keeps a long API key inside the card', async ({ page }) => {
    await page.locator(API_KEY_READY).fill(`AK_CS.${'x'.repeat(400)}`);
    await assertInsideContainer(page, AUTH_CARD, cardContents(AUTH_CARD));
  });

  test('reaches the picker preview step', async ({ page }) => {
    await page.locator(API_KEY_READY).fill('AK_CS.test');
    await page.getByRole('button', { name: 'Xem tài khoản' }).click();
    await expect(page.locator('fieldset')).toBeVisible();
    await assertCardLayout(page, AUTH_CARD);
  });

  test('keeps a long bank and holder name inside the card', async ({
    page,
  }) => {
    await page.locator(API_KEY_READY).fill('AK_CS.test');
    await page.getByRole('button', { name: 'Xem tài khoản' }).click();
    await expect(page.locator('fieldset')).toBeVisible();
    await assertInsideContainer(page, AUTH_CARD, cardContents(AUTH_CARD));
  });
});

test.describe('onboarding — previewed accounts', () => {
  test.beforeEach(async ({ page }) => {
    await stubOnboarding(page);
    await openRoute(page, '/onboarding', API_KEY_READY);
    await page.locator(API_KEY_READY).fill('AK_CS.test');
    await page.getByRole('button', { name: 'Xem tài khoản' }).click();
    await expect(page.locator('fieldset')).toBeVisible();
  });

  test('never scrolls horizontally and keeps controls inside the card', async ({
    page,
  }) => {
    await assertCardLayout(page, AUTH_CARD);
  });

  test('keeps a long account holder name inside the card', async ({ page }) => {
    await assertInsideContainer(page, AUTH_CARD, cardContents(AUTH_CARD));
  });

  test('leaves the account rows and action buttons reachable', async ({
    page,
  }) => {
    // The checkbox itself is 16px, but it is wrapped in a `<label>` that
    // toggles it, so the label is the real tap target.
    await assertHitTestable(page, 'label:has(input[type="checkbox"])');
    await assertMinTapTarget(
      page,
      'label:has(input[type="checkbox"])',
      TAP_TARGET_PX,
    );
    for (const selector of [
      'button:has-text("Sửa API Key")',
      'button:has-text("Xác nhận")',
      'button:has-text("Bỏ qua, đến trang chủ")',
    ]) {
      await assertHitTestable(page, selector);
      await assertMinTapTarget(page, selector, TAP_TARGET_PX);
    }
  });
});
