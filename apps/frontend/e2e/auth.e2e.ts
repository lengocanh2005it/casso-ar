import { expect, type Page, test } from '@playwright/test';
import {
  LONG_EMAIL,
  LONG_INVITE_TOKEN,
  LONG_ORGANIZATION_NAME_UNBREAKABLE,
  LONG_ORGANIZATION_NAME_WORDS,
  stubApi,
} from './fixtures/stub-api';
import {
  assertHitTestable,
  assertInsideContainer,
  assertMinTapTarget,
  assertNoHorizontalScroll,
  openRoute,
} from './layout-invariants';

/**
 * Layout invariants for every auth route, at every project width.
 *
 * The card must contain its own content: a control that escapes it is usually
 * clipped by an `overflow-hidden` ancestor, which `assertNoHorizontalScroll`
 * cannot see. The card is selected structurally — `main`'s grid child holding
 * the logo link — because the harness bans `data-testid` for layout assertions.
 */
const AUTH_CARD = 'main > div > div:has(a[aria-label*="Về trang chủ"])';
/** `/admin/login` renders its own card instead of using `AuthStatusCard`. */
const ADMIN_CARD = 'main > div';
const CARD_INPUT = 'input:not([type="checkbox"])';
const CARD_BUTTON = 'button';
/** Every node the card owns, to catch long content clipped inside it. */
const cardContents = (card: string) => `${card} *`;

/** WCAG 2.2 AA target size (SC 2.5.8), the floor for a control the user hits. */
const TAP_TARGET_PX = 44;
/** Inline text links sit in the text flow and cannot be 44px tall. */
const INLINE_LINK_PX = 24;

/** Controls a user must reach, per route. */
const CONTROLS = {
  login: [
    'input[name="email"]',
    'input[name="password"]',
    'button[type="submit"]',
    'a[href="/signup"]',
    'a[href="/forgot-password"]',
  ],
  signupTaxCode: ['input[name="taxCode"]', 'button[type="submit"]'],
  signupConfirm: ['button[type="button"]'],
  signupForm: [
    'input[name="organizationName"]',
    'input[name="name"]',
    'input[name="email"]',
    'input[name="password"]',
    'button[type="submit"]',
  ],
  otp: [
    'input[aria-label="Chữ số 1 trong mã OTP"]',
    'input[aria-label="Chữ số 6 trong mã OTP"]',
    'button[type="submit"]',
    'a[href="/login"]',
  ],
  forgotPassword: [
    'input[name="email"]',
    'button[type="submit"]',
    'a[href="/login"]',
  ],
  resetPassword: [
    'input[name="newPassword"]',
    'button[type="submit"]',
    'a[href="/forgot-password"]',
  ],
  inviteAccept: [
    'input[name="name"]',
    'input[name="password"]',
    'button[type="submit"]',
    'a[href="/login"]',
  ],
  adminLogin: ['input[name="email"]', 'input[name="password"]'],
} as const;

async function assertCardLayout(page: Page, card: string) {
  await assertNoHorizontalScroll(page);
  await assertInsideContainer(page, card, CARD_INPUT);
  await assertInsideContainer(page, card, CARD_BUTTON);
}

/** Long content, so the assertion covers the whole card rather than one box. */
async function assertCardContentsFit(page: Page, card: string) {
  await assertNoHorizontalScroll(page);
  await assertInsideContainer(page, card, cardContents(card));
}

async function assertReachable(page: Page, selectors: readonly string[]) {
  for (const selector of selectors) {
    await assertHitTestable(page, selector);
    const inline = selector.startsWith('a[');
    await assertMinTapTarget(
      page,
      selector,
      inline ? INLINE_LINK_PX : TAP_TARGET_PX,
    );
  }
}

test.describe('login page', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
    await openRoute(page, '/login', '#email');
  });

  test('never scrolls horizontally and keeps controls inside the card', async ({
    page,
  }) => {
    await assertCardLayout(page, AUTH_CARD);
  });

  test('leaves every control reachable', async ({ page }) => {
    await assertReachable(page, CONTROLS.login);
  });

  test('keeps a long email inside the card', async ({ page }) => {
    await page.locator('#email').fill(LONG_EMAIL);
    await assertCardContentsFit(page, AUTH_CARD);
  });
});

test.describe('signup — tax code step', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
    await openRoute(page, '/signup', '#taxCode');
  });

  test('never scrolls horizontally and keeps controls inside the card', async ({
    page,
  }) => {
    await assertCardLayout(page, AUTH_CARD);
  });

  test('leaves every control reachable', async ({ page }) => {
    await assertReachable(page, CONTROLS.signupTaxCode);
  });
});

test.describe('signup — organization confirm step', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page, {
      routes: {
        'v1/tax-verification/lookup': {
          body: { name: LONG_ORGANIZATION_NAME_UNBREAKABLE },
        },
      },
    });
    await openRoute(page, '/signup', '#taxCode');
    await page.locator('#taxCode').fill('0101234567');
    await page.locator('button[type="submit"]').click();
    await expect(
      page.getByRole('heading', { name: 'Xác nhận tổ chức' }),
    ).toBeVisible();
  });

  test('never scrolls horizontally and keeps controls inside the card', async ({
    page,
  }) => {
    await assertCardLayout(page, AUTH_CARD);
  });

  test('keeps a 200-character unbreakable organization name inside the card', async ({
    page,
  }) => {
    await assertCardContentsFit(page, AUTH_CARD);
  });

  test('leaves every control reachable', async ({ page }) => {
    await assertReachable(page, CONTROLS.signupConfirm);
  });
});

test.describe('signup — form step', () => {
  test.beforeEach(async ({ page }) => {
    // A lookup that 500s drops straight to the form with the warning banner.
    await stubApi(page, {
      routes: {
        'v1/tax-verification/lookup': {
          status: 500,
          body: {
            statusCode: 500,
            errorCode: 'INTERNAL_ERROR',
            message: 'lookup failed',
          },
        },
      },
    });
    await openRoute(page, '/signup', '#taxCode');
    await page.locator('#taxCode').fill('0101234567');
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('#organizationName')).toBeVisible();
  });

  test('never scrolls horizontally and keeps controls inside the card', async ({
    page,
  }) => {
    await assertCardLayout(page, AUTH_CARD);
  });

  test('leaves every control reachable', async ({ page }) => {
    await assertReachable(page, CONTROLS.signupForm);
  });

  test('keeps a long unbreakable organization name inside the card', async ({
    page,
  }) => {
    await page
      .locator('#organizationName')
      .fill(LONG_ORGANIZATION_NAME_UNBREAKABLE);
    await assertCardContentsFit(page, AUTH_CARD);
  });

  test('keeps a long organization name with spaces inside the card', async ({
    page,
  }) => {
    await page.locator('#organizationName').fill(LONG_ORGANIZATION_NAME_WORDS);
    await assertCardContentsFit(page, AUTH_CARD);
  });
});

test.describe('signup — OTP step', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page, {
      routes: {
        'v1/tax-verification/lookup': { body: { name: 'Công ty TNHH ABC' } },
        'v1/auth/signup': { body: {} },
      },
    });
    await openRoute(page, '/signup', '#taxCode');
    await page.locator('#taxCode').fill('0101234567');
    await page.locator('button[type="submit"]').click();
    await expect(
      page.getByRole('heading', { name: 'Xác nhận tổ chức' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Đúng, đây là tổ chức của tôi' })
      .click();
    await expect(page.locator('#organizationName')).toBeVisible();
    await page.locator('#organizationName').fill('Công ty TNHH ABC');
    await page.locator('#name').fill('Nguyễn Văn A');
    await page.locator('#email').fill(LONG_EMAIL);
    await page.locator('#password').fill('password123');
    await page.locator('button[type="submit"]').click();
    await expect(
      page.locator('input[aria-label="Chữ số 1 trong mã OTP"]'),
    ).toBeVisible();
  });

  test('never scrolls horizontally and keeps controls inside the card', async ({
    page,
  }) => {
    await assertCardLayout(page, AUTH_CARD);
  });

  test('leaves the OTP fields and submit reachable', async ({ page }) => {
    // The submit button is `disabled` until six digits are entered, and a
    // disabled control carries `pointer-events: none`. Fill the code first,
    // so the assertion measures the button a user can actually click.
    for (const index of [1, 2, 3, 4, 5, 6]) {
      await page
        .locator(`input[aria-label="Chữ số ${index} trong mã OTP"]`)
        .fill(String(index));
    }
    await assertReachable(page, CONTROLS.otp);
  });

  test('keeps the OTP row inside the card at every width', async ({ page }) => {
    await assertInsideContainer(page, AUTH_CARD, cardContents(AUTH_CARD));
  });
});

test.describe('email verification', () => {
  test('renders the OTP step without horizontal scroll', async ({ page }) => {
    await stubApi(page);
    await openRoute(
      page,
      `/verify-email?email=${encodeURIComponent(LONG_EMAIL)}`,
      'h1',
    );
    await assertCardLayout(page, AUTH_CARD);
    for (const index of [1, 2, 3, 4, 5, 6]) {
      await page
        .locator(`input[aria-label="Chữ số ${index} trong mã OTP"]`)
        .fill(String(index));
    }
    await assertReachable(page, CONTROLS.otp);
  });

  test('keeps the pending-review card inside its bounds', async ({ page }) => {
    await stubApi(page, {
      routes: {
        'v1/auth/verify-email': {
          status: 403,
          body: {
            statusCode: 403,
            errorCode: 'ORGANIZATION_PENDING_REVIEW',
            message: 'Tổ chức đang chờ duyệt',
          },
        },
      },
    });
    await openRoute(page, '/verify-email?email=ban@congty.com', 'h1');
    for (const index of [1, 2, 3, 4, 5, 6]) {
      await page
        .locator(`input[aria-label="Chữ số ${index} trong mã OTP"]`)
        .fill(String(index));
    }
    await page.locator('button[type="submit"]').click();
    await expect(
      page.getByRole('heading', { name: 'Email đã được xác minh' }),
    ).toBeVisible();

    await assertCardContentsFit(page, AUTH_CARD);
  });

  test('keeps the missing-email alert inside its bounds', async ({ page }) => {
    await stubApi(page);
    await openRoute(page, '/verify-email', 'h1');
    await assertCardContentsFit(page, AUTH_CARD);
  });
});

test.describe('forgot password', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page, {
      routes: { 'v1/auth/forgot-password': { body: {} } },
    });
    await openRoute(page, '/forgot-password', '#email');
  });

  test('never scrolls horizontally and keeps controls inside the card', async ({
    page,
  }) => {
    await assertCardLayout(page, AUTH_CARD);
  });

  test('leaves every control reachable', async ({ page }) => {
    await assertReachable(page, CONTROLS.forgotPassword);
  });

  test('keeps the sent confirmation inside the card', async ({ page }) => {
    await page.locator('#email').fill(LONG_EMAIL);
    await page.locator('button[type="submit"]').click();
    await expect(
      page.getByRole('heading', { name: 'Kiểm tra email' }),
    ).toBeVisible();
    await assertCardContentsFit(page, AUTH_CARD);
  });
});

test.describe('reset password', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page, {
      routes: { 'v1/auth/reset-password': { body: {} } },
    });
    await openRoute(page, '/reset-password?token=abc123', '#newPassword');
  });

  test('never scrolls horizontally and keeps controls inside the card', async ({
    page,
  }) => {
    await assertCardLayout(page, AUTH_CARD);
  });

  test('leaves every control reachable', async ({ page }) => {
    await assertReachable(page, CONTROLS.resetPassword);
  });

  test('keeps the success card inside the card', async ({ page }) => {
    await page.locator('#newPassword').fill('password123');
    await page.locator('button[type="submit"]').click();
    await expect(
      page.getByRole('heading', { name: 'Mật khẩu đã được đặt lại' }),
    ).toBeVisible();
    await assertCardContentsFit(page, AUTH_CARD);
  });
});

test.describe('invite acceptance', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page, {
      routes: { 'v1/invites/accept': { body: {} } },
    });
    await openRoute(page, '/invite-accept?token=abc123', '#name');
  });

  test('never scrolls horizontally and keeps controls inside the card', async ({
    page,
  }) => {
    await assertCardLayout(page, AUTH_CARD);
  });

  test('leaves every control reachable', async ({ page }) => {
    await assertReachable(page, CONTROLS.inviteAccept);
  });

  test('survives a 512-character invite token without breaking the layout', async ({
    page,
  }) => {
    // The token is never rendered, so it cannot overflow by itself. This
    // guards the page against a 512-char query string breaking the layout, and
    // it fails loudly if a future change starts rendering the token.
    await openRoute(page, `/invite-accept?token=${LONG_INVITE_TOKEN}`, '#name');
    await assertCardContentsFit(page, AUTH_CARD);
  });

  test('keeps the success card inside the card', async ({ page }) => {
    await page.locator('#name').fill('Nguyễn Văn A');
    await page.locator('#password').fill('password123');
    await page.locator('button[type="submit"]').click();
    await expect(
      page.getByRole('heading', { name: 'Tham gia tổ chức thành công' }),
    ).toBeVisible();
    await assertCardContentsFit(page, AUTH_CARD);
  });
});

test.describe('admin login', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
    await openRoute(page, '/admin/login', 'input[name="email"]');
  });

  test('never scrolls horizontally and keeps controls inside the card', async ({
    page,
  }) => {
    await assertCardLayout(page, ADMIN_CARD);
  });

  test('leaves every control reachable', async ({ page }) => {
    await assertReachable(page, CONTROLS.adminLogin);
  });
});
