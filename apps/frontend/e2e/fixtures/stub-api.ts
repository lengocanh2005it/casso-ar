import type { Page } from '@playwright/test';

/**
 * API stubs for viewport tests.
 *
 * The harness boots only the frontend dev server, so every `/api/*` request
 * would otherwise hit `localhost:3000` and fail. Auth and onboarding states
 * that live behind a response (the signup `confirming` and `otp` steps, the
 * OTP pending-review card, an authenticated onboarding page) cannot be reached
 * without an answer, so they are stubbed here instead of standing up Postgres
 * and Redis — which would defeat the point of a fast browser-only harness.
 *
 * A stub that is never matched is a test bug, not a silent pass: every stub
 * aborts the request with a 501 and a `stub-api:unmatched` marker so an
 * unstubbed call shows up as a failure rather than a hung render.
 */

export interface StubbedUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  organizationId: string;
  organizationName: string;
  subscriptionPlan: string;
  bankingLinked: boolean;
}

export const DEFAULT_USER: StubbedUser = {
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

type RouteHandler = Parameters<Page['route']>[1];

/** Fails loudly instead of letting an unstubbed call reach a dead backend. */
const UNMATCHED = async (route: Parameters<RouteHandler>[0]) => {
  await route.fulfill({
    status: 501,
    contentType: 'application/json',
    body: JSON.stringify({
      statusCode: 501,
      errorCode: 'STUB_API_UNMATCHED',
      message: `stub-api:unmatched ${route.request().method()} ${
        new URL(route.request().url()).pathname
      }`,
    }),
  });
};

const json =
  (body: unknown, status = 200): RouteHandler =>
  async (route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  };

export interface StubApiOptions {
  /** GET /api/v1/auth/me — the profile behind `useAuth`. */
  user?: StubbedUser;
  /** POST /api/v1/auth/refresh — mints the access token `/me` then rides on. */
  accessToken?: string;
  /** Extra routes, keyed by the path only (`/api/v1/invites/accept`). */
  routes?: Record<string, RouteHandler | { status?: number; body: unknown }>;
  /**
   * Abort every unmatched `/api/**` request instead of answering 501. Useful
   * when a test wants the app's own network-error path.
   */
  passthrough?: boolean;
}

export async function stubApi(
  page: Page,
  options: StubApiOptions = {},
): Promise<void> {
  const {
    user = DEFAULT_USER,
    accessToken = 'stub-access-token',
    routes = {},
    passthrough = false,
  } = options;

  await page.route('**/api/v1/auth/me', json(user));
  await page.route('**/api/v1/auth/refresh', json({ accessToken }));
  // The 60s session poll and the dashboard prefetch both land here on any
  // authenticated route; a bare user payload keeps them harmless.
  await page.route('**/api/v1/reports/dashboard-summary', json({}));

  for (const [path, handler] of Object.entries(routes)) {
    const resolved =
      typeof handler === 'function'
        ? handler
        : json(handler.body, handler.status ?? 200);
    await page.route(`**${path}`, resolved);
  }

  if (!passthrough) {
    await page.route('**/api/**', UNMATCHED);
  }
}

/**
 * Give the page a session so `useAuth` restores a user on load.
 *
 * `AuthContext` skips the refresh entirely unless the local session hint is
 * present, so the hint has to be written before the app's first script runs —
 * `addInitScript`, not a `goto` that lands afterwards.
 */
export async function stubSession(
  page: Page,
  user: StubbedUser = DEFAULT_USER,
): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('casso:has-session', '1');
  });
  await stubApi(page, { user });
}

/** Long content that overflows rather than wrapping. */
export const LONG_ORGANIZATION_NAME_UNBREAKABLE =
  'CongtyTNHHMotBaTramLinhMotNghinTyTramPhanTramXuatkhauvaNhapkhauvaDichvuVanChuyenHangHoaKhongPhanLoai'.repeat(
    2,
  );

export const LONG_ORGANIZATION_NAME_WORDS =
  'Công ty TNHH Một Bà Trăm Linh Một Nghìn Tỷ Trăm Phần Trăm Xuất khẩu và nhập khẩu và dịch vụ vận chuyển hàng hóa không phân loại'.repeat(
    2,
  );

/** Longest legal address: 64-char local part, total under the RFC 254 cap. */
export const LONG_EMAIL = `${'a'.repeat(64)}@${`b`.repeat(60)}.vn`;

export const LONG_INVITE_TOKEN = 'x'.repeat(512);
