# Public marketing landing page (issue #143)

## Summary

`apps/frontend/src/routes/index.tsx` currently has no top-level route for `/` — an
unauthenticated visitor hitting the root domain falls through to `ProtectedRoute`
(redirected to `/login`) with no marketing page in between. This adds a public,
guest-accessible landing page at `/`, mirroring the existing `GuestRoute` pattern
used for `/login` and `/signup`: an authenticated visitor is redirected to
`/dashboard`; an unauthenticated visitor sees the marketing page.

Target audience: Vietnamese SME finance/accounting decision-makers evaluating a B2B
SaaS tool. The page must read as credible and professional (no template-generic
gradient-blob hero, no filler animation) — this is a trust-building surface, not a
consumer landing page.

Structural reference: sibling project `xcash-ai`
(`apps/frontend/src/pages/landing/`) — same section order and componentization
convention (Navbar → Hero → About → Stats → Features → Steps → Pricing → CTA →
Footer; `About` is an addition on top of xcash-ai's own section list, filling a
gap xcash-ai doesn't have — a short "what is this product" intro), different
product/copy/visual treatment.

## Non-goals

- No blog, docs, or changelog pages — landing page only.
- No A/B testing or analytics wiring — out of scope, not requested.
- No new design tokens — reuses the repo's existing OKLCH theme (`index.css`) as-is.
- No i18n / language switcher (Vietnamese ↔ English) — this landing page ships
  Vietnamese-only, matching the rest of the app today. i18n is a cross-cutting
  concern (would touch every page, not just landing), tracked separately in
  issue #187 rather than folded into this scope.

## Design System (reused, not invented)

The repo's actual `apps/frontend/src/index.css` tokens are the source of truth —
**not** any generic palette a design-suggestion tool proposes. Landing page consumes
these via existing Tailwind semantic classes (`bg-primary`, `text-foreground`,
`border-border`, etc.), never raw hex.

| Token | Light | Role |
|---|---|---|
| `--primary` | `oklch(0.635 0.168 155)` (~`#16A668`) | CTA, links, logo accent |
| `--background` / `--foreground` | white / near-black-green | page base |
| `--secondary`, `--muted`, `--accent` | pale greens | section alternation, badges |
| `--border` | pale gray | hairline dividers ("ledger-line" motif) |
| `--chart-1..5` | green→blue ramp | reserved, not used decoratively in v1 |

Font: `Be Vietnam Pro` (`--font-sans`, already loaded) for both display and body —
no new font. Hierarchy comes from weight/tracking, not a second typeface:
headline 700 tight-tracking, body 400 relaxed, money/stat figures 600
`tabular-nums` (accounting product — figures must align like a ledger).

Radius (`--radius: 0.75rem`) and existing keyframes (`fade-up`, `banner-in`) are
reused where they fit; new scroll-reveal/hover motion uses `framer-motion` (see
Motion section) layered on top, not a replacement.

### Visual direction ("the ledger, live")

Avoid the generic AI-landing defaults (gradient-blob backgrounds, warm-cream serif
hero, broadsheet hairline maximalism) by grounding every visual choice in the
product's real domain model instead of decoration:

- The hero demo card shows a live-updating **receivable ticker** — a small set of
  fabricated example rows (customer name, amount, status) that cycle and
  transition `OPEN → PARTIALLY_PAID → PAID`, re-using the existing
  `ReceivableStatusBadge` component (`components/receivable-status-badge.tsx`) for
  the status pill instead of inventing a new one. This directly demonstrates the
  product's real value prop (bank-hook reconciliation) instead of an abstract
  dashboard screenshot.
- Structural dividers between sections use hairline `border-border`, not colored
  blocks — "ledger-line" motif consistent with the accounting subject matter.
- The `StepsSection`'s numbered markers (1/2/3) are legitimate here — connecting a
  bank account → receiving transactions → auto-reconciliation is a genuine
  sequential process, not decoration.
- No gradient-text headlines, no background blur blobs — flat color + hairline
  border, in line with the "credible B2B tool" bar the product owner set.

### Logo

Two SVGs provided by the user, saved as-is (single-color path, fill hardcoded in
the source `#16A668` / `#15AB64` — kept as authored, not remapped to `--primary`):

- `apps/frontend/src/assets/casso-ledger-logo.svg` — full lockup (icon + "CASSO
  LEDGER" wordmark, horizontal), used in the navbar (desktop) and footer.
- `apps/frontend/src/assets/casso-ledger-icon.svg` — icon-only mark (the
  cat/owl mascot), used in the mobile navbar and the `Sheet` menu header.

`components/logo.tsx` (new — first dedicated Logo component in the repo; existing
UI is text-only branding) inlines both SVGs as JSX (no SVGR dependency — the repo
has none installed and a single flattened path per file doesn't need one), exposing:

```typescript
interface LogoProps {
  variant?: 'full' | 'icon'; // default 'full'
  className?: string;
}
```

## Responsive & quality bar

Explicit, testable requirements — not left to "looks fine on my screen":

- **Breakpoints:** verify at 375px (small phone), 768px (tablet), 1024px
  (small laptop), 1440px (desktop) — matches the repo's existing Tailwind
  breakpoint usage elsewhere in the app. No horizontal scroll at any width.
- **Container:** consistent `max-w-6xl` centered container across every
  section (matches `xcash-ai`'s convention) — sections don't drift to
  different widths from each other.
- **Hero 2-column layout** collapses to a single stacked column below `lg:`
  (copy first, `HeroDemoCard` second) — not squeezed side-by-side on tablet.
- **Grids:** `FeaturesSection` 3-col → 1-col on mobile, `PricingSection` 4-col
  → 2-col (tablet) → 1-col (mobile), `StatsBand` 4-col → 2-col on mobile —
  all via Tailwind responsive grid classes, no JS-based layout switching.
- **Touch targets:** every interactive element (nav links, CTA buttons, Sheet
  trigger, pricing card CTAs) ≥44×44px, ≥8px spacing between adjacent targets.
- **Typography scale:** headline clamps down on mobile (`text-4xl` →
  `sm:text-5xl` style scaling, not a fixed desktop size that overflows small
  viewports); body text stays ≥16px on mobile (avoids iOS auto-zoom on any
  form input the page might add later).
- **Contrast:** body text ≥4.5:1 against `--background` in both light and dark
  mode — verified independently per theme, not assumed from light mode alone.
- **Motion:** every `framer-motion`/`typewriter-effect` animation respects
  `prefers-reduced-motion` (see Motion section) — checked with the OS setting
  on, not just visually reviewed with it off.
- **Focus states:** visible keyboard focus ring on every interactive element
  (nav links, CTA buttons, pricing card buttons) — landing page is a
  pre-auth surface, first thing many keyboard/screen-reader users hit.

This list is the acceptance bar for "trang layout vừa vặn, phù hợp mọi thiết
bị" — the plan's testing step should include a manual pass through this list
at each breakpoint before requesting review, in addition to the automated
component tests below.

## Copy voice

Plain, active, specific — describe what the user does, not what the product "is."
Avoid stock SaaS phrasing ("giải pháp toàn diện", "chuyển đổi số").

**No technical/system jargon in any user-facing copy** — this is a business
audience (finance/accounting decision-makers), not a technical one. Every string
in `landing-data.ts` and every section's hardcoded copy must be phrased in
business/operational language, never implementation or integration terms:

| Avoid (technical) | Use instead (business) |
|---|---|
| "Cas ID/CASSO Balance Hook", "webhook", "API" | "kết nối trực tiếp với ngân hàng", "đồng bộ giao dịch tự động" |
| "RBAC", "phân quyền RBAC" | "phân quyền theo vai trò trong công ty" / "mỗi nhân sự chỉ thấy đúng phần việc của mình" |
| "SMTP riêng" | "gửi email nhắc nợ từ chính địa chỉ công ty bạn" |
| "webhook nhận giao dịch" | "giao dịch ngân hàng báo về ngay khi phát sinh" |

(This table governs display copy only — internal spec/code sections below still
name the real technical mechanism, e.g. `AboutSection`'s content brief, where
precision matters for implementation.)

Example headline direction: "Thu tiền [cycling: không cần nhắc lại / không cần
Excel / không cần đoán]" with a fixed sub-line explaining the bank connection in
plain terms ("Giao dịch ngân hàng về tới đâu, đối chiếu công nợ tới đó — không
cần đợi kế toán nhập tay"), not by naming the integration mechanism. CTA buttons
use the same verb the destination page uses ("Dùng thử miễn phí" → signup page
itself says "Đăng ký", so button says "Dùng thử miễn phí" consistently across
hero/CTA, never mixed with "Bắt đầu ngay" elsewhere).

## Backend: public plan catalog endpoint

Today plan data is split across two places with no public read path:

- `apps/backend/src/modules/billing/domain/subscription.ts` — `PLAN_CATALOG`
  (usage limits: `receivableMonthlyLimit`, `bankConnectionLimit`,
  `copilotChatMonthlyLimit`, `canUseCustomSmtp`), private to the module.
- `apps/backend/src/modules/payos/application/plan-price.ts` — `PLAN_PRICE_VND`
  (299_000 / 999_000 / 2_999_000 / 0), used only for PayOS checkout amount.

Both describe the same four `PlanId`s. Consolidate into one domain-level read
model in `billing` (the module that already owns `Subscription`/`PlanConfig`),
and have `payos` import the price from there instead of maintaining a second
source — this closes the existing drift risk (a plan price change today has no
enforcement that both files get updated together) as an in-scope side benefit,
not scope creep, since the new public endpoint requires resolving it anyway.

### Domain (`modules/billing/domain/subscription.ts`)

- Extend `PlanConfig` with `priceVnd: number`.
- Merge `PLAN_PRICE_VND`'s four values into `PLAN_CATALOG`.
- Add exported pure function `getPlanCatalog(): PlanCatalogEntry[]`, where
  `PlanCatalogEntry = { planId: PlanId; priceVnd: number; receivableMonthlyLimit:
  number; bankConnectionLimit: number; copilotChatMonthlyLimit: number }` (tier
  and `canUseCustomSmtp` stay internal — not part of the public read model unless
  a future plan needs to advertise it).

### `modules/payos/application/plan-price.ts`

Deleted; `initiate-plan-upgrade-order.usecase.ts` and
`initiate-period-charge.usecase.ts` import price via the billing domain's
`getPlanCatalog()` (or a small `getPlanPriceVnd(planId)` helper next to it) instead.

### Application

`GetPublicPlansUseCase` (`modules/billing/application/get-public-plans.usecase.ts`)
— no repository dependency, no tenant context (pre-auth, matches the "no identity
to check permissions against yet" pattern used for login/signup). Wraps
`getPlanCatalog()` for symmetry with other use cases even though it's a pure
domain call, so the controller never imports domain functions directly (keeps the
`presentation → application → domain` dependency rule intact).

### Presentation

New `presentation/public-plans.controller.ts` — **not** added to
`billing.controller.ts`, which is `@Controller('subscriptions')` +
class-level `@UseGuards(PermissionGuard)` (fully authenticated/tenant-scoped;
mixing a public route in would blur that controller's bounded context).

```typescript
@ApiTags('billing')
@Controller('plans')
export class PublicPlansController {
  constructor(private readonly getPublicPlans: GetPublicPlansUseCase) {}

  @Get()
  @ApiOperation({ summary: 'List public plan catalog (pricing + limits)' })
  @ApiOkResponse({ type: PlanCatalogEntryDto, isArray: true })
  list(): PlanCatalogEntryDto[] {
    return this.getPublicPlans.execute().map(toPlanCatalogEntryDto);
  }
}
```

`GET /api/v1/plans` — no guard, no `@RequirePermission()` (pre-auth endpoint).
Response DTO: `{ planId, label, priceVnd, receivableMonthlyLimit,
bankConnectionLimit, copilotChatMonthlyLimit }[]` — no internal fields to leak
(no `organizationId`/`version` on a static catalog).

`billing.module.ts` registers the new controller + use case alongside the
existing ones.

### Testing (TDD)

- `subscription.spec.ts`: extend existing suite — `getPlanCatalog()` returns 4
  entries with the known price/limit values (RED: function doesn't exist yet →
  GREEN: add it).
- `get-public-plans.usecase.spec.ts`: new — returns the domain catalog unchanged.
- `public-plans.controller.e2e-spec.ts`: new — `GET /api/v1/plans` returns 200
  with no auth header, matches shape.
- Existing `initiate-plan-upgrade-order.usecase.spec.ts` /
  `initiate-period-charge.usecase.spec.ts`: update the price lookup call site,
  confirm they still pass (regression, not new behavior).

## Frontend

### Routing

`apps/frontend/src/routes/index.tsx`:

- Remove `{ index: true, element: <Navigate to="/dashboard" replace /> }` from
  `appRoutes` (dead code once `/` has its own public route — an authenticated
  visitor hitting `/` is now redirected to `/dashboard` by `GuestRoute` itself,
  same mechanism as `/login`).
- Add `LandingPage` (lazy-loaded, same `withPageSuspense` pattern as every other
  route) to a new top-level array or directly into `authRoutes`-adjacent list:
  `{ path: '/', element: <GuestRoute>{withPageSuspense(<LandingPage />)}</GuestRoute> }`.

`App.tsx`: render this route in `AppRoutes()` alongside `authRoutes`/`adminRoutes`,
before the `ProtectedRoute` block (order doesn't affect matching since `/` no
longer exists inside the protected layout's children, but keeping it grouped with
`authRoutes` — both are `GuestRoute`-gated — matches the existing code's grouping
logic).

### Structure (`features/landing/`)

```
features/landing/
  pages/
    landing-page.tsx        composes all sections
  components/
    landing-navbar.tsx      fixed, scroll-shadow, anchor nav, Sheet mobile menu
    hero-section.tsx        2-col: copy+CTA left, HeroDemoCard right
    hero-demo-card.tsx      cycling receivable ticker (setInterval, matches
                             xcash-ai's HeroDemoCard timing/fade pattern)
    about-section.tsx       short "what is Casso Ledger" intro — 2–3 sentence
                             paragraph in plain business language (product +
                             audience + "giao dịch ngân hàng về tới đâu, đối
                             chiếu công nợ tới đó" — no "Cas ID"/"CASSO Balance
                             Hook"/"webhook" naming in the displayed copy) plus
                             3 value pillars (icon + short label: "Tự động đối
                             chiếu" / "Nhắc nợ đúng lúc" / "Báo cáo minh bạch").
                             Deliberately not a card grid — distinct from
                             `FeaturesSection`'s detailed capability list, kept
                             short to match the "credible B2B tool" pacing bar
                             (no redundant restating of features here).
    stats-band.tsx          4-tile grid of qualitative feature-highlight badges
                             (icon + short label, e.g. "Đối chiếu ngân hàng
                             theo thời gian thực", "Không giới hạn số khách
                             hàng ở gói Free") — no customer/org-count or
                             usage-volume numbers. Revisited: fabricated
                             traction numbers ("500+ doanh nghiệp") were
                             rejected mid-brainstorm as a B2B trust risk (a
                             prospect asking for references would expose a
                             fabricated claim) — capability claims about the
                             product itself carry no such risk and are what
                             this band shows instead.
    features-section.tsx    3-col card grid (capability areas: receivables
                             tracking, payment allocation, reminders, aging
                             reports, role-based access) — card copy phrased in
                             business language per the jargon table (e.g. the
                             role-based-access card says "Phân quyền theo vai
                             trò trong công ty", never "RBAC")
    steps-section.tsx       3-step: connect bank → receive transactions →
                             auto-reconcile
    pricing-section.tsx     fetches GET /api/v1/plans via useQuery; BUSINESS
                             tier renders with a "Phổ biến nhất" badge and
                             primary-border/ring highlight (mirrors xcash-ai's
                             `highlight` treatment on its upper-mid PRO tier —
                             BUSINESS is the equivalent position, tier 3 of 4).
                             `highlight` is a frontend-only display flag keyed
                             off `planId === PlanId.BUSINESS`, not a backend
                             field — the public API returns plain catalog data,
                             no "featured" concept in the domain.

                             Each card shows a checklist (Check icon, matches
                             xcash-ai's PricingSection list pattern), combining
                             two sources per plan:
                             1. Computed bullets from the fetched API limits —
                                "{receivableMonthlyLimit} khoản phải thu/tháng",
                                "{bankConnectionLimit} kết nối ngân hàng",
                                "{copilotChatMonthlyLimit} lượt chat Copilot" —
                                formatted client-side, not hardcoded numbers, so
                                a backend limit change reflects automatically.
                             2. Static qualitative features from
                                `landing-data.ts` (`PLAN_FEATURE_COPY: Record<
                                PlanId, string[]>`), phrased in business
                                language per the Copy voice jargon table —
                                e.g. "Phân quyền theo vai trò trong công ty",
                                "Báo cáo công nợ theo tuổi nợ", "Gửi email nhắc
                                nợ từ địa chỉ công ty bạn" (BUSINESS+/ENTERPRISE
                                only, matches `canUseCustomSmtp` but expressed
                                as plain business copy, not fetched — this list
                                has no backend equivalent, purely presentational,
                                same as xcash-ai's hardcoded `features` array).
    cta-section.tsx         final CTA block
    landing-footer.tsx      logo + copyright + login/signup links
  api/
    get-plans.ts            api-client call, GET /api/v1/plans
  hooks/
    use-plans.ts             useQuery wrapper around get-plans
  landing-data.ts            typed static copy: features, steps, stats,
                              headline cycling phrases — no hardcoded JSX strings
  index.ts                   barrel export

components/
  logo.tsx                   new Logo component (see Logo section above)
```

`landing-data.ts` follows the same typed-data-not-JSX convention as xcash-ai's
file of the same name.

### Motion

`framer-motion` (new dependency) + `typewriter-effect` (new dependency) —
neither exists in this repo or in the `xcash-ai` reference today.

- Scroll reveal: `motion.div` + `whileInView`, `viewport={{ once: true }}`, child
  stagger 30–50ms, on `FeaturesSection`/`StepsSection`/`PricingSection`.
- Hover/press: `whileHover`/`whileTap` scale 0.98–1.02 on feature cards.
- Mobile menu: `AnimatePresence` around the `Sheet` content.
- Headline: `typewriter-effect` cycles through 2–3 short phrases in the H1 (see
  Copy voice). Fixed sub-line copy is not animated.
- `useReducedMotion()` (framer-motion) gates all of the above — reduced-motion
  users get the final state immediately, typewriter renders its first phrase
  statically with no cycling.
- Existing CSS keyframes (`fade-up`, `banner-in`) are untouched, used only where
  already used (toasts/banners) — not repurposed for landing page motion.

Restraint per the "credible B2B tool" bar: one orchestrated hero moment (ticker +
typewriter), everything else is a single scroll-reveal + hover state — no
page-load choreography, no parallax, no decorative background animation.

### Reused components

- `ReceivableStatusBadge` (`components/receivable-status-badge.tsx`) — hero demo
  card ticker status pill.
- `ThemeToggle` (`components/layout/theme-toggle.tsx`) — navbar.
- `Button`, `Card`, `Badge`, `Sheet` (shadcn primitives already in
  `components/ui/`) — no new primitives.
- `formatVND` (`lib/domain-utils.ts`) — pricing section price display.

### Testing

- `landing-page.spec.tsx`: renders all sections.
- `landing-navbar.spec.tsx`: scroll-shadow class toggle, mobile Sheet
  open/close, anchor scroll calls `scrollIntoView`.
- `pricing-section.spec.tsx`: renders plans from a mocked `GET /api/v1/plans`
  response, loading/error states.
- `hero-demo-card.spec.tsx`: cycles through ticker rows on a fake timer
  (`vi.useFakeTimers`).
- Routing: extend `app-routes.spec.tsx` (or add a landing-specific case) —
  unauthenticated visitor at `/` sees the landing page; authenticated visitor at
  `/` is redirected to `/dashboard`.

## Open items resolved during brainstorming

- Pricing: real prices exist in the backend (`PLAN_PRICE_VND`), just never
  exposed publicly — new endpoint resolves this, no placeholder pricing.
- Stats band: no real customer metrics exist yet (pre-launch). Initially
  considered fabricated traction numbers (customer/org counts), then rejected
  during brainstorming as a B2B trust risk — a prospect asking for references
  would expose a fabricated claim. Resolved as qualitative product-capability
  badges only, no numbers claiming customer traction.
- Logo: two SVGs (full lockup, icon-only) provided directly by the user, saved
  under `apps/frontend/src/assets/`.
