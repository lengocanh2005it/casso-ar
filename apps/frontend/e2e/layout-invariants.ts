import { expect, type Page } from '@playwright/test';

export async function settleFonts(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
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
