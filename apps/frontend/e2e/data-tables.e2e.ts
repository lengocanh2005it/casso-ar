import { expect, type Page, test } from '@playwright/test';
import {
  installDataTableApiFixture,
  LONG_CUSTOMER_NAMES,
} from './fixtures/data-table-api-fixture';
import {
  assertCellContentWithinCell,
  assertNoHorizontalScroll,
  assertRowHeightAtMost,
  openRoute,
} from './layout-invariants';

const TABLE = '[data-slot="table"]';
const TABLE_ROWS = `${TABLE} tbody tr`;

async function openDataTable(page: Page, path: string): Promise<void> {
  await installDataTableApiFixture(page);
  await openRoute(page, path, TABLE_ROWS);
}

async function assertTableGeometry(
  page: Page,
  viewportWidth: number,
): Promise<void> {
  await assertNoHorizontalScroll(page);
  await assertRowHeightAtMost(
    page,
    TABLE_ROWS,
    viewportWidth >= 1024 ? 64 : 120,
  );
  await assertCellContentWithinCell(page, TABLE);
}

async function assertLongNameTooltip(page: Page): Promise<void> {
  const label = page
    .locator(`${TABLE} tbody tr span.truncate`)
    .filter({ hasText: LONG_CUSTOMER_NAMES[0] })
    .first();

  await expect(label).toBeVisible();
  await expect
    .poll(() =>
      label.evaluate((element) => element.scrollWidth > element.clientWidth),
    )
    .toBe(true);
  await label.hover();
  await expect(page.getByRole('tooltip')).toContainText(LONG_CUSTOMER_NAMES[0]);
}

async function assertResponsiveGrid(
  page: Page,
  viewportWidth: number,
  breakpointWidth = 768,
): Promise<void> {
  const narrow = viewportWidth < breakpointWidth;
  const header = page.locator(`${TABLE} thead`);
  const firstRow = page.locator(TABLE_ROWS).first();

  if (narrow) {
    await expect(header).toBeHidden();
  } else {
    await expect(header).toBeVisible();
  }
  await expect
    .poll(() => firstRow.evaluate((row) => getComputedStyle(row).display))
    .toBe(narrow ? 'grid' : 'table-row');
}

test.describe('data tables', () => {
  test('customers table clips and reveals the full long name', async ({
    page,
    viewport,
  }) => {
    await openDataTable(page, '/customers');
    expect(LONG_CUSTOMER_NAMES).toHaveLength(3);
    expect(LONG_CUSTOMER_NAMES.every((name) => name.length >= 200)).toBe(true);
    await expect(page.locator(TABLE_ROWS)).toHaveCount(3);
    await assertTableGeometry(page, viewport?.width ?? 0);
    await assertResponsiveGrid(page, viewport?.width ?? 0);
    await assertLongNameTooltip(page);
  });

  test('receivables table clips and reveals the full long name', async ({
    page,
    viewport,
  }) => {
    await openDataTable(page, '/receivables');
    await assertTableGeometry(page, viewport?.width ?? 0);
    await assertResponsiveGrid(page, viewport?.width ?? 0);
    await assertLongNameTooltip(page);
  });

  test('exceptions table clips and reveals the full long name', async ({
    page,
    viewport,
  }) => {
    await openDataTable(page, '/exceptions');
    await assertTableGeometry(page, viewport?.width ?? 0);
    await assertResponsiveGrid(page, viewport?.width ?? 0, 1024);
    await assertLongNameTooltip(page);
  });

  test('reminder executions keep their table header and cell tooltip', async ({
    page,
    viewport,
  }) => {
    const viewportWidth = viewport?.width ?? 0;
    await openDataTable(page, '/reminders');
    await assertTableGeometry(page, viewportWidth);
    await expect(page.locator(`${TABLE} thead`)).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(TABLE_ROWS)
          .first()
          .evaluate((row) => getComputedStyle(row).display),
      )
      .toBe('table-row');
    if (viewportWidth < 768) {
      await expect(page.locator('[data-slot="table-container"]')).toHaveCSS(
        'overflow-x',
        'auto',
      );
    }
    await assertLongNameTooltip(page);
  });
});
