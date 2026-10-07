import { expect, type Page, test } from '@playwright/test';
import {
  type StubApiOptions,
  type StubbedUser,
  stubApi,
} from './fixtures/stub-api';
import {
  assertChartsFit,
  assertDarkModeContrast,
  assertNoHorizontalScroll,
  openRoute,
} from './layout-invariants';

const USER: StubbedUser = {
  id: 'user-1',
  email: 'owner@example.test',
  name: 'Nguyễn Văn A',
  avatarUrl: null,
  role: 'OWNER',
  organizationId: 'org-1',
  organizationName: 'Công ty ABC',
  subscriptionPlan: 'BUSINESS',
  bankingLinked: true,
};

const SUMMARY = {
  totalOutstanding: 12_000_000,
  totalOverdue: 2_000_000,
  overdueRate: 1 / 6,
  cashForecast: { forecast7d: 0, forecast14d: 0, forecast30d: 0 },
  topOverdueCustomers: [],
  autoMatchRate: null,
  manualHandlingRate: null,
  reminderEffectiveness: null,
};

const TREND = {
  months: 6,
  items: [
    { month: '2026-05', outstanding: 10_000_000, collected: 3_000_000 },
    { month: '2026-06', outstanding: 12_000_000, collected: 5_000_000 },
  ],
};

const AGING_BUCKETS = [
  { bucket: 'NOT_DUE', count: 3, totalRemaining: 6_000_000 },
  { bucket: 'OVERDUE_1_7', count: 1, totalRemaining: 1_000_000 },
  { bucket: 'OVERDUE_8_30', count: 1, totalRemaining: 2_000_000 },
  { bucket: 'OVERDUE_31_60', count: 1, totalRemaining: 1_000_000 },
  { bucket: 'OVERDUE_60_PLUS', count: 1, totalRemaining: 2_000_000 },
];

const AGING_REPORT = { buckets: AGING_BUCKETS };

const customerAgingItem = (id: number) => ({
  customerId: `customer-${id}`,
  customerName: `Khách hàng ${id}`,
  taxCode: `01000000${String(id).padStart(2, '0')}`,
  buckets: AGING_BUCKETS.map(({ bucket, totalRemaining }) => ({
    bucket,
    totalRemaining: id === 1 ? totalRemaining : 0,
  })),
  totalRemaining: id === 1 ? 12_000_000 : 0,
});

const activityItem = (id: number) => ({
  id: `activity-${id}`,
  receivableId: `receivable-${id}`,
  customerId: `customer-${id}`,
  activityType: 'RECEIVABLE_CREATED',
  description: `Tạo khoản phải thu ${id}`,
  createdAt: '2026-10-06T10:00:00.000Z',
});

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((value) => {
    localStorage.setItem('casso-ar:theme', value);
    localStorage.setItem('casso:has-session', '1');
  }, theme);
}

async function openAppSurface(
  page: Page,
  path: string,
  waitForFixture: (page: Page) => Promise<void>,
  routes: NonNullable<StubApiOptions['routes']>,
  theme: 'light' | 'dark' = 'light',
  accessToken?: string,
) {
  await setTheme(page, theme);
  await stubApi(page, {
    user: USER,
    ...(accessToken ? { accessToken } : {}),
    routes: {
      'v1/alerts': { body: { items: [], total: 0, unreadCount: 0 } },
      'v1/bank-transactions/pending-review-count': { body: { count: 0 } },
      'v1/alerts/stream': async (route) => {
        await route.abort();
      },
      ...routes,
    },
  });
  await openRoute(page, path, 'h1');
  await waitForFixture(page);
}

async function openDashboard(
  page: Page,
  activityCount: number,
  theme: 'light' | 'dark' = 'light',
) {
  await openAppSurface(
    page,
    '/dashboard',
    async (readyPage) => {
      await expect(
        readyPage.locator('.recharts-responsive-container svg').first(),
      ).toBeVisible();
      if (activityCount === 0) {
        await expect(readyPage.getByText('Chưa có hoạt động')).toBeVisible();
      } else {
        await expect(
          readyPage.getByText(`Tạo khoản phải thu ${activityCount}`),
        ).toBeVisible();
      }
    },
    {
      'v1/reports/dashboard-summary': { body: SUMMARY },
      'v1/reports/trend': { body: TREND },
      'v1/activity': {
        body: {
          items: Array.from({ length: activityCount }, (_, index) =>
            activityItem(index + 1),
          ),
          total: activityCount,
          page: 1,
          limit: 10,
        },
      },
    },
    theme,
  );
  await expect(page.getByRole('heading', { name: 'Trang chủ' })).toBeVisible();
  await expect(
    page.locator('.recharts-responsive-container svg').first(),
  ).toBeVisible();
}

test.describe('dashboard viewport layout', () => {
  for (const [label, count] of [
    ['empty', 0],
    ['one item', 1],
    ['full page', 10],
  ] as const) {
    test(`${label} activity stays within the viewport`, async ({ page }) => {
      await openDashboard(page, count);

      await expect(page.getByText('Hoạt động gần đây')).toBeVisible();
      if (count > 0) {
        await expect(
          page.getByText(`Tạo khoản phải thu ${count}`),
        ).toBeVisible();
      }
      await assertNoHorizontalScroll(page);
      await assertChartsFit(page);
    });
  }

  for (const theme of ['light', 'dark'] as const) {
    test(`keeps chart surfaces inside their cards in ${theme} mode`, async ({
      page,
    }) => {
      await openDashboard(page, 1, theme);
      await assertNoHorizontalScroll(page);
      await assertChartsFit(page);
      if (theme === 'dark') await assertDarkModeContrast(page);
    });
  }
});

test.describe('reports viewport layout', () => {
  for (const [label, count] of [
    ['empty', 0],
    ['one item', 1],
    ['full page', 20],
  ] as const) {
    test(`${label} customer aging stays readable`, async ({ page }) => {
      await openAppSurface(
        page,
        '/reports',
        async (readyPage) => {
          await expect(
            readyPage.getByText(
              count === 0
                ? 'Chưa có khách hàng còn công nợ'
                : `Khách hàng ${count}`,
              { exact: count > 0 },
            ),
          ).toBeVisible();
          await expect(
            readyPage.locator('.recharts-responsive-container svg').first(),
          ).toBeVisible();
        },
        {
          'v1/reports/dashboard-summary': { body: SUMMARY },
          'v1/reports/aging': { body: AGING_REPORT },
          'v1/reports/aging/customers': {
            body: {
              items: Array.from({ length: count }, (_, index) =>
                customerAgingItem(index + 1),
              ),
              total: count,
              page: 1,
              limit: 20,
            },
          },
          'v1/reports/trend': { body: { ...TREND, months: 12 } },
        },
      );
      await expect(
        page.getByRole('heading', { name: 'Báo cáo' }),
      ).toBeVisible();
      if (count === 0) {
        await expect(
          page.getByText('Chưa có khách hàng còn công nợ'),
        ).toBeVisible();
      } else {
        await expect(
          page.getByText(`Khách hàng ${count}`, { exact: true }),
        ).toBeVisible();
      }
      await assertNoHorizontalScroll(page);
      await assertChartsFit(page);
    });
  }

  for (const theme of ['light', 'dark'] as const) {
    test(`keeps charts and ageing table inside their cards in ${theme} mode`, async ({
      page,
    }) => {
      await openAppSurface(
        page,
        '/reports',
        async (readyPage) => {
          await expect(
            readyPage.getByText('Khách hàng 1', { exact: true }),
          ).toBeVisible();
          await expect(
            readyPage.locator('.recharts-responsive-container svg').first(),
          ).toBeVisible();
        },
        {
          'v1/reports/dashboard-summary': { body: SUMMARY },
          'v1/reports/aging': { body: AGING_REPORT },
          'v1/reports/aging/customers': {
            body: {
              items: [customerAgingItem(1)],
              total: 1,
              page: 1,
              limit: 20,
            },
          },
          'v1/reports/trend': { body: { ...TREND, months: 12 } },
        },
        theme,
      );
      await expect(
        page.getByRole('heading', { name: 'Báo cáo' }),
      ).toBeVisible();
      await expect(
        page.getByText('Khách hàng 1', { exact: true }),
      ).toBeVisible();
      await assertNoHorizontalScroll(page);
      await assertChartsFit(page);
      if (theme === 'dark') await assertDarkModeContrast(page);
    });
  }
});

const bankConnection = (id: number) => ({
  id: `connection-${id}`,
  cassoFlowAuthorizationId: `authorization-${id}`,
  accountNumber: `012345678${String(id).padStart(2, '0')}`,
  bankName: `Ngân hàng ${id}`,
  accountHolderName: 'Công ty ABC',
  status: 'ACTIVE',
  connectedAt: '2026-10-01T10:00:00.000Z',
  lastSyncAt: '2026-10-06T10:00:00.000Z',
  createdAt: '2026-10-01T10:00:00.000Z',
});

test.describe('bank connections viewport layout', () => {
  for (const [label, count] of [
    ['empty', 0],
    ['one item', 1],
    ['full page', 20],
  ] as const) {
    test(`${label} connections stay readable`, async ({ page }) => {
      await openAppSurface(
        page,
        '/bank-connections',
        async (readyPage) => {
          await expect(
            readyPage.getByText(
              count === 0 ? 'Chưa có kết nối ngân hàng' : `Ngân hàng ${count}`,
              { exact: count > 0 },
            ),
          ).toBeVisible();
        },
        {
          'v1/bank-connections': {
            body: {
              items: Array.from({ length: count }, (_, index) =>
                bankConnection(index + 1),
              ),
              total: count,
              page: 1,
              limit: 100,
            },
          },
        },
      );
      await expect(
        page.getByRole('heading', { name: 'Kết nối ngân hàng' }),
      ).toBeVisible();
      if (count === 0) {
        await expect(page.getByText('Chưa có kết nối ngân hàng')).toBeVisible();
      } else {
        await expect(
          page.getByText(`Ngân hàng ${count}`, { exact: true }),
        ).toBeVisible();
      }
      await assertNoHorizontalScroll(page);
    });
  }

  test('dark mode preserves contrast on the connection list', async ({
    page,
  }) => {
    await openAppSurface(
      page,
      '/bank-connections',
      async (readyPage) => {
        await expect(
          readyPage.getByText('Ngân hàng 1', { exact: true }),
        ).toBeVisible();
      },
      {
        'v1/bank-connections': {
          body: { items: [bankConnection(1)], total: 1, page: 1, limit: 100 },
        },
      },
      'dark',
    );
    await expect(page.getByText('Ngân hàng 1', { exact: true })).toBeVisible();
    await assertNoHorizontalScroll(page);
    await assertDarkModeContrast(page);
  });
});

const ACTIVE_CONVERSATION_ID =
  '00000000-0000-4000-8000-000000000001' satisfies ReturnType<
    typeof crypto.randomUUID
  >;

const copilotConversation = (id: number) => ({
  id: `conversation-${id}`,
  title: `Cuộc trò chuyện ${id}`,
  createdAt: '2026-10-01T10:00:00.000Z',
  lastMessageAt: '2026-10-06T10:00:00.000Z',
});

const copilotDraft = (id: number) => ({
  id: `draft-${id}`,
  receivableId: `receivable-${id}`,
  recipientEmail: `customer${id}@example.test`,
  subject: `Bản nháp ${id}`,
  bodyHtml: '<p>Nhắc thanh toán</p>',
  status: 'DRAFTED',
  pendingActionId: null,
  createdAt: '2026-10-06T10:00:00.000Z',
});

async function openCopilot(page: Page, count: number, theme: 'light' | 'dark') {
  await page.addInitScript((conversationId) => {
    crypto.randomUUID = () =>
      conversationId as ReturnType<typeof crypto.randomUUID>;
  }, ACTIVE_CONVERSATION_ID);
  await openAppSurface(
    page,
    '/copilot',
    async (readyPage) => {
      await expect(
        readyPage.getByText('Đã dùng 2/50 lượt Copilot trong tháng này'),
      ).toBeVisible();
    },
    {
      'v1/copilot/usage': {
        body: {
          turnsUsed: 2,
          turnsLimit: 50,
          periodStart: '2026-10-01',
          periodEnd: '2026-10-31',
        },
      },
      'v1/copilot/conversations': {
        body: {
          items: Array.from({ length: count }, (_, index) =>
            copilotConversation(index + 1),
          ),
          total: count,
        },
      },
      [`v1/copilot/conversations/${ACTIVE_CONVERSATION_ID}/messages`]: {
        body: { items: [] },
      },
      'v1/copilot/drafts': {
        body: {
          items: Array.from({ length: count }, (_, index) =>
            copilotDraft(index + 1),
          ),
          total: count,
        },
      },
    },
    theme,
  );
  await expect(page.getByRole('heading', { name: 'Copilot' })).toBeVisible();
}

test.describe('Copilot viewport layout', () => {
  for (const [label, count] of [
    ['empty', 0],
    ['one item', 1],
    ['full page', 20],
  ] as const) {
    test(`${label} conversations and drafts stay inside the viewport`, async ({
      page,
    }) => {
      await openCopilot(page, count, 'light');
      await assertNoHorizontalScroll(page);

      await page.getByRole('button', { name: 'Mở lịch sử chat' }).click();
      if (count === 0) {
        await expect(page.getByText('Chưa có cuộc trò chuyện')).toBeVisible();
      } else {
        await expect(
          page.getByRole('button', { name: `Cuộc trò chuyện ${count}` }),
        ).toBeVisible();
      }
      await assertNoHorizontalScroll(page);
      await page.getByRole('button', { name: 'Đóng lịch sử chat' }).click();

      await page.getByRole('button', { name: 'Mở bản nháp email' }).click();
      if (count === 0) {
        await expect(
          page.getByText('Chưa có bản nháp email nào.'),
        ).toBeVisible();
      } else {
        await expect(
          page.getByText(`Bản nháp ${count}`, { exact: true }),
        ).toBeVisible();
      }
      await assertNoHorizontalScroll(page);
    });
  }

  test('dark mode preserves contrast', async ({ page }) => {
    await openCopilot(page, 1, 'dark');
    await assertNoHorizontalScroll(page);
    await assertDarkModeContrast(page);
  });
});

const organizationMember = (id: number) => ({
  id: `membership-${id}`,
  userId: `member-${id}`,
  email: `member${id}@example.test`,
  name: `Thành viên ${id}`,
  role: 'ACCOUNTANT',
  joinedAt: '2026-10-01T10:00:00.000Z',
  status: 'ACTIVE',
  blockedAt: null,
});

const organizationInvite = (id: number) => ({
  id: `invite-${id}`,
  email: `invite${id}@example.test`,
  role: 'ACCOUNTANT',
  invitedAt: '2026-10-01T10:00:00.000Z',
  expiresAt: '2026-10-08T10:00:00.000Z',
});

const emailTemplate = (id: number) => ({
  id: `template-${id}`,
  name: `Mẫu email ${id}`,
  subject: `Nhắc thanh toán ${id}`,
  bodyHtml: '<p>Xin vui lòng thanh toán.</p>',
  reminderStage: null,
  isDefault: false,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  attachments: [],
});

const auditLog = (id: number) => ({
  id: `audit-${id}`,
  userId: USER.id,
  actionType: 'RECEIVABLE_CREATED',
  entityType: 'Receivable',
  entityId: `receivable-${id}`,
  beforeState: null,
  afterState: { amount: 1_000_000 },
  ipAddress: null,
  createdAt: '2026-10-06T10:00:00.000Z',
  display: {
    entityLabel: `Khoản phải thu ${id}`,
    customerNames: {},
    invoiceNumbers: {},
  },
});

const webhook = (id: number) => ({
  id: `webhook-${id}`,
  bankConnectionId: `connection-${id}`,
  providerTransactionId: `transaction-${id}`,
  rawPayload: { id },
  receivedAt: '2026-10-06T10:00:00.000Z',
  status: 'RECEIVED',
  processedAt: null,
  errorMessage: null,
  retryCount: 0,
});

const SETTINGS_TABS = [
  ['Giao diện', 'appearance'],
  ['Thanh toán', 'billing'],
  ['Người dùng', 'users'],
  ['Mẫu email', 'templates'],
  ['Email riêng', 'smtp'],
  ['Nhật ký', 'audit-log'],
  ['Webhook', 'webhook-inbox'],
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number][1];

function settingsRoutes(count: number): NonNullable<StubApiOptions['routes']> {
  return {
    'v1/plans': { body: [] },
    'v1/payos/payment-history': {
      body: { items: [], total: 0, page: 1, limit: 20 },
    },
    'v1/organizations/org-1/members': {
      body: {
        items: Array.from({ length: count }, (_, index) =>
          organizationMember(index + 1),
        ),
        total: count,
        page: 1,
        limit: 20,
      },
    },
    'v1/organizations/org-1/invites': {
      body: {
        items: Array.from({ length: count }, (_, index) =>
          organizationInvite(index + 1),
        ),
        total: count,
        page: 1,
        limit: 20,
      },
    },
    'v1/organizations/org-1/ownership-transfers/pending-for-me': {
      body: null,
    },
    'v1/organizations/org-1/ownership-transfers/current': { body: null },
    'v1/email-templates': {
      body: Array.from({ length: count }, (_, index) =>
        emailTemplate(index + 1),
      ),
    },
    'v1/smtp-config': { body: null },
    'v1/audit-logs': {
      body: {
        items: Array.from({ length: count }, (_, index) => auditLog(index + 1)),
        total: count,
      },
    },
    'v1/webhooks/inbox': {
      body: {
        items: Array.from({ length: count }, (_, index) => webhook(index + 1)),
        total: count,
      },
    },
  };
}

async function waitForSettingsFixture(
  page: Page,
  tab: SettingsTab,
  count: number,
): Promise<void> {
  if (tab === 'appearance') {
    await expect(
      page.getByText('Chọn chế độ hiển thị cho ứng dụng.'),
    ).toBeVisible();
  } else if (tab === 'billing') {
    await expect(
      page.getByText('Chưa có thông tin giá và giới hạn cho các gói.'),
    ).toBeVisible();
    await expect(page.getByText('Chưa có lịch sử thanh toán.')).toBeVisible();
  } else if (tab === 'users') {
    if (count === 0) {
      await expect(page.getByText('Chưa có thành viên nào.')).toBeVisible();
      await expect(
        page.getByText('Không có lời mời nào đang chờ.'),
      ).toBeVisible();
    } else {
      await expect(
        page.getByText(`Thành viên ${count}`, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(`invite${count}@example.test`, { exact: true }),
      ).toBeVisible();
    }
  } else if (tab === 'templates') {
    await expect(
      page.getByText(count === 0 ? 'Chưa có mẫu email' : `Mẫu email ${count}`, {
        exact: count > 0,
      }),
    ).toBeVisible();
  } else if (tab === 'smtp') {
    await expect(
      page.getByText('Chưa cấu hình — email nhắc nợ đang gửi từ casso.vn.'),
    ).toBeVisible();
  } else if (tab === 'audit-log') {
    await expect(
      page.getByText(
        count === 0
          ? 'Chưa có nhật ký nào trong khoảng thời gian này.'
          : `Khoản phải thu ${count}`,
        { exact: count > 0 },
      ),
    ).toBeVisible();
  } else {
    if (count === 0) {
      await expect(page.getByText('Chưa có webhook nào.')).toBeVisible();
    } else {
      await expect(
        page.getByRole('button', { name: `Sao chép mã transaction-${count}` }),
      ).toBeVisible();
    }
  }
}

test.describe('settings viewport layout', () => {
  for (const [label, count] of [
    ['empty', 0],
    ['one item', 1],
    ['full page', 20],
  ] as const) {
    test(`${label} settings collections stay inside the viewport`, async ({
      page,
    }) => {
      await openAppSurface(
        page,
        '/settings?tab=appearance',
        async (readyPage) =>
          waitForSettingsFixture(readyPage, 'appearance', count),
        settingsRoutes(count),
      );
      await expect(
        page.getByRole('heading', { name: 'Cài đặt' }),
      ).toBeVisible();

      for (const [label, tab] of SETTINGS_TABS) {
        const trigger = page.getByRole('tab', { name: label });
        if (!(await trigger.isVisible())) {
          await page.getByRole('button', { name: /Xem thêm/u }).click();
        }
        await trigger.click();
        await expect(trigger).toHaveAttribute('aria-selected', 'true');
        await waitForSettingsFixture(page, tab, count);
        await assertNoHorizontalScroll(page);
      }
    });
  }

  test('all settings tabs meet dark-mode contrast', async ({ page }) => {
    await openAppSurface(
      page,
      '/settings?tab=appearance',
      async (readyPage) => waitForSettingsFixture(readyPage, 'appearance', 1),
      settingsRoutes(1),
      'dark',
    );
    for (const [label, tab] of SETTINGS_TABS) {
      const trigger = page.getByRole('tab', { name: label });
      if (!(await trigger.isVisible())) {
        await page.getByRole('button', { name: /Xem thêm/u }).click();
      }
      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-selected', 'true');
      await waitForSettingsFixture(page, tab, 1);
      await assertNoHorizontalScroll(page);
      await assertDarkModeContrast(page);
    }
  });
});

test('dark-mode contrast check rejects translucent low-contrast control edges', async ({
  page,
}) => {
  await page.setContent(`
    <html>
      <body style="background: rgb(24, 24, 27)">
        <input aria-label="contrast probe" style="border: 1px solid rgba(255, 255, 255, 0.01); background: transparent; color: white" />
      </body>
    </html>
  `);

  await expect(assertDarkModeContrast(page)).rejects.toThrow(/control input/u);
});

const operatorToken = `e30.${btoa(JSON.stringify({ isOperator: true, exp: 4_102_444_800 }))}.`;

const adminOrganization = (id: number) => ({
  id: `org-${id}`,
  name: `Tổ chức ${id}`,
  status: 'ACTIVE',
  taxCode: `01000000${String(id).padStart(2, '0')}`,
  taxCodeMatched: true,
  taxCodeLookupName: `Doanh nghiệp ${id}`,
  createdAt: '2026-10-01T10:00:00.000Z',
});

const adminMember = (id: number) => ({
  id: `membership-${id}`,
  userId: `member-${id}`,
  name: `Thành viên ${id}`,
  email: `member${id}@example.test`,
  role: 'ACCOUNTANT',
  joinedAt: '2026-10-01T10:00:00.000Z',
  status: 'ACTIVE',
  blockedAt: null,
});

const adminInvite = (id: number) => ({
  id: `invite-${id}`,
  email: `invite${id}@example.test`,
  role: 'ACCOUNTANT',
  invitedAt: '2026-10-01T10:00:00.000Z',
  expiresAt: '2026-10-08T10:00:00.000Z',
});

const adminUsage = (id: number) => ({
  organizationId: `org-${id}`,
  organizationName: `Tổ chức ${id}`,
  model: 'gpt-4o-mini',
  requestCount: id,
  totalTokens: id * 100,
  errorCount: 0,
});

const adminUsageTrend = (id: number) => ({
  date: `2026-10-${String(id).padStart(2, '0')}`,
  requestCount: id,
  totalTokens: id * 100,
});

function adminRoutes(count: number): NonNullable<StubApiOptions['routes']> {
  return {
    'v1/admin/organizations/summary': {
      body: {
        total: count,
        statusCounts: {
          ACTIVE: count,
          LOCKED: 0,
          PENDING_REVIEW: 0,
          REJECTED: 0,
        },
      },
    },
    'v1/admin/organizations': {
      body: {
        items: Array.from({ length: count }, (_, index) =>
          adminOrganization(index + 1),
        ),
        total: count,
        page: 1,
        limit: 50,
      },
    },
    'v1/admin/organizations/org-1': { body: adminOrganization(1) },
    'v1/admin/organizations/org-1/members': {
      body: {
        members: {
          items: Array.from({ length: count }, (_, index) =>
            adminMember(index + 1),
          ),
          total: count,
          page: 1,
          limit: 50,
        },
        pendingInvites: {
          items: Array.from({ length: count }, (_, index) =>
            adminInvite(index + 1),
          ),
          total: count,
          page: 1,
          limit: 50,
        },
      },
    },
    'v1/admin/ai-usage': {
      body: {
        items: Array.from({ length: count }, (_, index) =>
          adminUsage(index + 1),
        ),
      },
    },
    'v1/admin/ai-usage/trend': {
      body: {
        items: Array.from({ length: count }, (_, index) =>
          adminUsageTrend(index + 1),
        ),
      },
    },
  };
}

test.describe('operator viewport layout', () => {
  for (const [label, count] of [
    ['empty', 0],
    ['one item', 1],
    ['full page', 50],
  ] as const) {
    test(`${label} operator data stays within the viewport`, async ({
      page,
    }) => {
      const routes = adminRoutes(count);

      await openAppSurface(
        page,
        '/admin/dashboard',
        async (readyPage) => {
          await expect(
            readyPage.getByTestId('admin-summary-grid'),
          ).not.toContainText('–');
          await expect(
            readyPage
              .getByText(
                count === 0 ? 'Chưa có dữ liệu sử dụng.' : `Tổ chức ${count}`,
                { exact: count > 0 },
              )
              .first(),
          ).toBeVisible();
        },
        routes,
        'light',
        operatorToken,
      );
      await expect(
        page.getByRole('heading', { name: 'Tổng quan', exact: true }),
      ).toBeVisible();
      await assertNoHorizontalScroll(page);
      await assertChartsFit(page);

      await openRoute(page, '/admin/organizations', 'h1');
      await expect(
        page.getByRole('heading', { name: 'Tổ chức' }),
      ).toBeVisible();
      if (count === 0) {
        await expect(page.getByText('Chưa có tổ chức nào.')).toBeVisible();
      } else {
        await expect(
          page.getByRole('link', { name: 'Thành viên' }).last(),
        ).toHaveAttribute('href', `/admin/organizations/org-${count}/members`);
      }
      await assertNoHorizontalScroll(page);

      await openRoute(page, '/admin/organizations/org-1/members', 'h1');
      await expect(
        page.getByRole('heading', { name: 'Tổ chức 1' }),
      ).toBeVisible();
      if (count === 0) {
        await expect(page.getByText('Chưa có thành viên.')).toBeVisible();
      } else {
        await expect(
          page
            .getByText(`member${count}@example.test`, { exact: true })
            .filter({ visible: true })
            .first(),
        ).toBeVisible();
      }
      await assertNoHorizontalScroll(page);

      await openRoute(page, '/admin/ai-usage', 'h1');
      await expect(
        page.getByRole('heading', { name: 'Sử dụng AI' }),
      ).toBeVisible();
      if (count === 0) {
        await expect(
          page.getByText(
            'Chưa có dữ liệu sử dụng trong khoảng thời gian đã chọn.',
          ),
        ).toBeVisible();
      } else {
        await expect(
          page.getByText(`Tổ chức ${count}`, { exact: true }),
        ).toBeVisible();
      }
      await assertNoHorizontalScroll(page);
    });
  }

  test('all operator routes meet dark-mode contrast', async ({ page }) => {
    const routes = adminRoutes(1);
    await openAppSurface(
      page,
      '/admin/dashboard',
      async (readyPage) => {
        await expect(
          readyPage.getByTestId('admin-summary-grid'),
        ).not.toContainText('–');
        await expect(
          readyPage.getByText('Tổ chức 1', { exact: true }),
        ).toBeVisible();
      },
      routes,
      'dark',
      operatorToken,
    );
    await assertNoHorizontalScroll(page);
    await assertChartsFit(page);
    await assertDarkModeContrast(page);

    await openRoute(page, '/admin/organizations', 'h1');
    await expect(
      page.getByRole('link', { name: 'Thành viên' }).last(),
    ).toHaveAttribute('href', '/admin/organizations/org-1/members');
    await assertNoHorizontalScroll(page);
    await assertDarkModeContrast(page);

    await openRoute(page, '/admin/organizations/org-1/members', 'h1');
    await expect(
      page
        .getByText('member1@example.test', { exact: true })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await assertNoHorizontalScroll(page);
    await assertDarkModeContrast(page);

    await openRoute(page, '/admin/ai-usage', 'h1');
    await expect(page.getByText('Tổ chức 1', { exact: true })).toBeVisible();
    await assertNoHorizontalScroll(page);
    await assertDarkModeContrast(page);
  });
});
