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

export async function assertRowHeightAtMost(
  page: Page,
  selector: string,
  maxHeightPx: number,
): Promise<void> {
  const rows = page.locator(selector);
  await expect(rows.first()).toBeVisible();
  await expect
    .poll(
      () =>
        rows.evaluateAll((elements) =>
          Math.max(
            ...elements.map(
              (element) => element.getBoundingClientRect().height,
            ),
          ),
        ),
      {
        message: `rows matching ${selector} must be at most ${maxHeightPx}px tall`,
      },
    )
    .toBeLessThanOrEqual(maxHeightPx);
}

export async function assertCellContentWithinCell(
  page: Page,
  tableSelector: string,
): Promise<void> {
  const violations = await page.locator(tableSelector).evaluateAll((tables) => {
    const failures: string[] = [];

    for (const [tableIndex, table] of tables.entries()) {
      const cells = Array.from(table.querySelectorAll('tbody td'));

      for (const [cellIndex, cell] of cells.entries()) {
        const cellBounds = cell.getBoundingClientRect();
        const cellLabel = `table ${tableIndex + 1}, cell ${cellIndex + 1}`;
        const visibleElements = Array.from(
          cell.querySelectorAll<HTMLElement>('*'),
        );

        for (const element of visibleElements) {
          const style = getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden')
            continue;

          const bounds = element.getBoundingClientRect();
          if (bounds.width === 0 && bounds.height === 0) continue;
          if (
            bounds.left < cellBounds.left - 1 ||
            bounds.right > cellBounds.right + 1
          ) {
            failures.push(
              `${cellLabel}: <${element.tagName.toLowerCase()}> exceeds the cell`,
            );
          }
        }

        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          if (node.textContent?.trim()) {
            let ancestor = node.parentElement;
            let clippedInsideCell = false;
            while (ancestor && ancestor !== cell) {
              const overflowX = getComputedStyle(ancestor).overflowX;
              if (['auto', 'clip', 'hidden', 'scroll'].includes(overflowX)) {
                clippedInsideCell = true;
                break;
              }
              ancestor = ancestor.parentElement;
            }

            if (!clippedInsideCell) {
              const range = document.createRange();
              range.selectNodeContents(node);
              for (const bounds of Array.from(range.getClientRects())) {
                if (
                  bounds.left < cellBounds.left - 1 ||
                  bounds.right > cellBounds.right + 1
                ) {
                  failures.push(`${cellLabel}: visible text exceeds the cell`);
                  break;
                }
              }
            }
          }
          node = walker.nextNode();
        }
      }
    }

    return failures;
  });

  expect(
    violations,
    `cell content in ${tableSelector} must stay within each cell`,
  ).toEqual([]);
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

/**
 * Assert every element matching `selector` is fully inside `containerSelector`.
 *
 * `assertNoHorizontalScroll` only sees overflow. A child that escapes its card
 * is often clipped by an `overflow-hidden` ancestor, which has no scrollbar and
 * no width delta — the document stays 0px wide while the control is already
 * half off-screen. Comparing boxes catches that case directly.
 */
export async function assertInsideContainer(
  page: Page,
  containerSelector: string,
  selector: string,
): Promise<void> {
  const container = page.locator(containerSelector).first();
  await expect(container).toBeVisible();

  await expect
    .poll(
      () =>
        page.evaluate(
          ([containerSel, childSel]) => {
            const box = document
              .querySelector(containerSel)
              ?.getBoundingClientRect();
            if (!box) return 'container not found';

            const escaped: string[] = [];
            for (const el of document.querySelectorAll(childSel)) {
              const child = el.getBoundingClientRect();
              if (child.width === 0 && child.height === 0) continue;
              if (
                child.left < box.left ||
                child.right > box.right ||
                child.top < box.top ||
                child.bottom > box.bottom
              ) {
                escaped.push(
                  `${el.tagName.toLowerCase()}${
                    el.id ? `#${el.id}` : ''
                  } (${Math.round(child.left - box.left)}/${Math.round(
                    child.right - box.right,
                  )})`,
                );
              }
            }
            return escaped.length === 0 ? 'inside' : escaped.join(', ');
          },
          [containerSelector, selector] as const,
        ),
      {
        message: `every ${selector} must stay inside ${containerSelector}`,
        timeout: 10_000,
      },
    )
    .toBe('inside');
}

/**
 * Assert the element is the topmost thing at its own centre point.
 *
 * Being visible is not being reachable: an overlay or a sibling with a higher
 * stacking context can paint over a control while it still reports a normal
 * bounding box and `toBeVisible()` passes.
 */
export async function assertHitTestable(
  page: Page,
  selector: string,
): Promise<void> {
  const target = page.locator(selector).first();
  await expect(target).toBeVisible();

  await expect
    .poll(
      () =>
        target.evaluate((el) => {
          const box = el.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) return 'zero-sized';
          const x = box.left + box.width / 2;
          const y = box.top + box.height / 2;
          const hit = document.elementFromPoint(x, y);
          if (!hit) return 'nothing at centre';
          // Only the element itself or a descendant counts. Accepting an
          // ancestor would report a hit for any `pointer-events: none`
          // element, and `disabled` buttons carry exactly that — so a
          // control that cannot be clicked at all would pass.
          if (hit === el || el.contains(hit)) return 'hit';
          return `covered by ${hit.tagName.toLowerCase()}.${
            hit.className?.toString().split(' ')[0] ?? ''
          }`;
        }),
      { message: `${selector} must be hit-testable at its centre` },
    )
    .toBe('hit');
}
