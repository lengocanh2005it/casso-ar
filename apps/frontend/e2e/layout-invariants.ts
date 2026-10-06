import { expect, type Page } from '@playwright/test';

async function settleFonts(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Navigate and wait until the route has actually rendered.
 *
 * `page.goto()` resolves on the `load` event, which fires before React mounts.
 * A cold guest route shows `AuthLoading` while the auth effect resolves, and
 * the page itself is lazy-loaded behind a Suspense fallback. Both are narrow, so
 * measuring during either window reads a zero overflow delta and the assertion
 * passes without ever having looked at the real layout. `readySelector` must be
 * an element that only exists on the fully rendered route.
 */
export async function openRoute(
  page: Page,
  path: string,
  readySelector: string,
): Promise<void> {
  await page.goto(path);
  await page.locator(readySelector).first().waitFor({ state: 'visible' });
  await settleFonts(page);
}

export async function assertNoHorizontalScroll(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
      { message: 'document must not scroll horizontally' },
    )
    .toBe(0);
}

export async function assertNoHorizontalOverflowIn(
  page: Page,
  selector: string,
): Promise<void> {
  const target = page.locator(selector).first();
  await expect(target).toBeVisible();
  await expect
    .poll(() => target.evaluate((el) => el.scrollWidth - el.clientWidth), {
      message: `${selector} must not scroll horizontally`,
    })
    .toBe(0);
}

export async function assertMinTapTarget(
  page: Page,
  selector: string,
  minPx: number,
): Promise<void> {
  const target = page.locator(selector).first();
  await expect(target).toBeVisible();
  await expect
    .poll(
      async () => {
        const box = await target.boundingBox();
        return box ? Math.min(box.width, box.height) : 0;
      },
      { message: `${selector} must be at least ${minPx}x${minPx}px` },
    )
    .toBeGreaterThanOrEqual(minPx);
}
