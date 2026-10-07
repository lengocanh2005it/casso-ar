import AxeBuilder from '@axe-core/playwright';
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

export async function assertChartsFit(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.locator('.recharts-responsive-container').evaluateAll((charts) => {
          const overflow: string[] = [];
          charts.forEach((chart, index) => {
            const host = chart.getBoundingClientRect();
            const content = chart.querySelectorAll(
              'svg.recharts-surface, svg text',
            );
            for (const element of content) {
              const box = element.getBoundingClientRect();
              if (box.width === 0 && box.height === 0) continue;
              // SVG text bounds can land a fraction of a CSS pixel past the
              // rounded container edge; allow one pixel for that rounding.
              if (box.left < host.left - 1 || box.right > host.right + 1) {
                overflow.push(
                  `chart ${index}: ${element.textContent?.trim() || element.tagName.toLowerCase()} (${Math.round(box.left - host.left)}/${Math.round(box.right - host.right)})`,
                );
              }
            }
          });
          return overflow.join(', ');
        }),
      {
        message: 'chart surfaces and labels must stay inside their containers',
      },
    )
    .toBe('');
}

export async function assertDarkModeContrast(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withRules(['color-contrast'])
    .analyze();
  const failures = violations.flatMap((violation) =>
    violation.nodes.map(
      (node) =>
        `${node.target.join(', ')}: ${node.failureSummary ?? violation.help}`,
    ),
  );
  expect(failures, 'dark-mode text must meet WCAG AA contrast').toEqual([]);

  const chartFailures = await page.evaluate(() => {
    type ParsedColor = { channels: number[]; alpha: number };

    const parseColor = (value: string) => {
      const oklch = value.match(
        /^oklch\(([\d.]+)(%?)\s+([\d.]+)(%?)\s+([\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+)(%?))?\)$/u,
      );
      if (oklch) {
        const lightness = Number(oklch[1]) / (oklch[2] ? 100 : 1);
        const chroma = Number(oklch[3]) / (oklch[4] ? 100 : 1);
        const hue = (Number(oklch[5]) * Math.PI) / 180;
        const a = chroma * Math.cos(hue);
        const b = chroma * Math.sin(hue);
        const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
        const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
        const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
        const linearChannels = [
          4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
          -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
          -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
        ];
        return {
          channels: linearChannels.map((channel) => {
            const linear = Math.max(0, Math.min(1, channel));
            return (
              255 *
              (linear <= 0.0031308
                ? linear * 12.92
                : 1.055 * linear ** (1 / 2.4) - 0.055)
            );
          }),
          alpha: oklch[6] ? Number(oklch[6]) / (oklch[7] ? 100 : 1) : 1,
        };
      }
      if (!value.startsWith('rgb')) return null;
      const values = value.match(/[\d.]+/gu)?.map(Number);
      return values && values.length >= 3
        ? { channels: values.slice(0, 3), alpha: values[3] ?? 1 }
        : null;
    };
    const composite = (
      foreground: ParsedColor,
      background: ParsedColor,
    ): ParsedColor => {
      const alpha =
        foreground.alpha + background.alpha * (1 - foreground.alpha);
      if (alpha === 0) return { channels: [0, 0, 0], alpha: 0 };
      return {
        channels: foreground.channels.map(
          (channel, index) =>
            (channel * foreground.alpha +
              background.channels[index] *
                background.alpha *
                (1 - foreground.alpha)) /
            alpha,
        ),
        alpha,
      };
    };
    const luminance = (channels: number[]) => {
      const linear = channels.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const ratio = (foreground: string, background: ParsedColor | null) => {
      const fg = parseColor(foreground);
      if (!fg || !background || background.alpha < 0.99) return null;
      const visibleForeground = composite(fg, background);
      if (visibleForeground.alpha < 0.99) return null;
      const values = [
        luminance(visibleForeground.channels),
        luminance(background.channels),
      ].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    const surfaceColor = (element: Element): ParsedColor | null => {
      const backgrounds: ParsedColor[] = [];
      let current: Element | null = element;
      while (current) {
        const color = parseColor(getComputedStyle(current).backgroundColor);
        if (color && color.alpha > 0) backgrounds.push(color);
        current = current.parentElement;
      }
      let surface: ParsedColor = { channels: [0, 0, 0], alpha: 0 };
      for (const background of backgrounds.reverse()) {
        surface = composite(background, surface);
      }
      return surface.alpha >= 0.99 ? surface : null;
    };
    const failures: string[] = [];
    for (const label of document.querySelectorAll('svg text, svg tspan')) {
      const box = label.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const foreground = getComputedStyle(label).fill;
      const background = surfaceColor(label);
      const contrast = background ? ratio(foreground, background) : null;
      if (contrast !== null && contrast < 4.5) {
        failures.push(
          `chart label “${label.textContent?.trim()}” ${foreground} on rgb(${background?.channels.join(', ')}) (${contrast.toFixed(2)}:1)`,
        );
      }
    }
    for (const control of document.querySelectorAll(
      'button[aria-label] svg, [role="button"][aria-label] svg, [role="combobox"], input:not([type="hidden"]), textarea',
    )) {
      const box = control.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const style = getComputedStyle(control);
      const foreground =
        control instanceof SVGElement
          ? style.stroke === 'none'
            ? style.fill
            : style.stroke
          : style.borderTopColor;
      const background =
        control instanceof SVGElement
          ? surfaceColor(control.parentElement ?? control)
          : surfaceColor(control);
      const contrast = background ? ratio(foreground, background) : null;
      if (contrast !== null && contrast < 3) {
        failures.push(
          `control ${control.tagName.toLowerCase()} ${foreground} on rgb(${background?.channels.join(', ')}) (${contrast.toFixed(2)}:1)`,
        );
      }
    }
    return failures;
  });
  expect(
    chartFailures,
    'chart labels need 4.5:1 and visible control edges/icons need 3:1 contrast',
  ).toEqual([]);
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
