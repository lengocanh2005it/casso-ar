import { expect, test } from '@playwright/test';
import {
  assertMinTapTarget,
  assertNoHorizontalScroll,
  settleFonts,
} from './layout-invariants';

const MOBILE_NAV_TRIGGER = '[aria-label="Mở menu"]';
const TAP_TARGET_PX = 44;

test.describe('landing page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await settleFonts(page);
  });

  test('never scrolls horizontally', async ({ page }) => {
    await assertNoHorizontalScroll(page);
  });

  test('keeps the mobile nav trigger a 44px tap target', async ({
    page,
    viewport,
  }) => {
    test.skip(
      (viewport?.width ?? 0) >= 1024,
      'the mobile trigger is lg:hidden, so it does not exist at desktop widths',
    );
    await assertMinTapTarget(page, MOBILE_NAV_TRIGGER, TAP_TARGET_PX);
  });
});

test.describe('login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await settleFonts(page);
  });

  test('never scrolls horizontally', async ({ page }) => {
    await assertNoHorizontalScroll(page);
  });

  test('renders the email and password fields', async ({ page }) => {
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
  });
});
