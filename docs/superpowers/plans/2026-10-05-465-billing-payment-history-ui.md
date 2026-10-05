# Billing payment history UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan inline.

**Goal:** Show tenant-scoped plan payment history in Billing settings with accessible states, URL pagination and bounded checkout refresh.

**Architecture:** Reuse the existing `GET /api/v1/payos/payment-history` endpoint and shared payment enums. Add one settings API query, then render a focused payment-history section below the plan cards using the existing table, pagination, formatter and URL-query helpers. Return the generated order code with upgrade checkout creation so the open modal can match its exact history row. Match PayOS return `orderCode` against API history; URL status is only a polling hint and never payment evidence.

**Tech Stack:** React, TanStack Query, React Router, Vitest, shadcn Table, shared `@casso-ar/shared-types`.

## Global Constraints

- Payment history contains received-money evidence (`ACCEPTED` or `REVIEW_REQUIRED`), not checkout attempts with no received money.
- Unknown legacy amounts display `Không có dữ liệu`; review-required evidence displays `Cần đối soát` and does not imply current case state.
- Display `confirmedAt` as `Thời gian xác nhận`; do not call it provider transfer time.
- History is newest first; API pagination defaults to page 1 and limit 20 (maximum 100).
- Only users with `Permission.SUBSCRIPTION_MANAGE` can see history or trigger its request.
- Do not add dependencies, duplicate shared enums, or trust URL status as confirmation.
- Keep all changes in `.worktrees/feat/465-billing-payment-history`.

---

## Files

- Modify `apps/frontend/src/features/settings/types.ts` for the frontend response shape using shared enums.
- Modify `apps/frontend/src/features/settings/api/settings-api.ts` and `settings-api.spec.ts` for the paginated GET request.
- Modify `apps/frontend/src/features/settings/api/use-settings.ts` for the React Query hook.
- Create `apps/frontend/src/features/settings/components/plan-payment-history.tsx` and its spec for the accessible history UI, URL page state, error retry and checkout refresh.
- Modify `apps/frontend/src/features/settings/components/billing-tab.tsx` and its spec to place the section below plan cards and gate it by `SUBSCRIPTION_MANAGE`.
- Modify `apps/frontend/src/features/settings/pages/settings-page.spec.tsx` to preserve the existing permission boundary.
- Modify `apps/backend/src/modules/payos/application/renewal-reminder-scanner.service.ts` and its spec so renewal return/cancel links target `/settings?tab=billing`.
- Modify `docs/wayfinder/feature-map.md` as the ticket moves from ready to in-progress, then done when the PR is created.

## Task 1 — Fetch paginated payment history

**Seam:** `fetchPlanPaymentHistory({page, limit})` and the query hook consumed by the Billing history UI.

- [x] Add an API test that expects GET `/api/v1/payos/payment-history` with page and limit query parameters.
- [x] Run the focused API test and confirm it fails because the function is missing.
- [x] Add the typed response and API function, then assert the response is returned unchanged.
- [x] Add the React Query hook keyed by organization, page and limit; do not issue the query when the caller disables it.
- [x] Run the focused API and hook checks plus frontend type-check.

## Task 2 — Render history under plan cards

**Seam:** DOM behavior under `MemoryRouter`, with the public API query mocked at its request boundary.

- [x] Add UI tests for columns/labels, shared plan and outcome enums, VND/date formatting, null legacy amount, and received-money status.
- [x] Add tests for loading, empty, error/retry, and page navigation updating the URL and request page.
- [x] Run the focused tests and confirm each new behavior fails before the implementation.
- [x] Implement the section with shared shadcn Table and `CardPagination`; page is URL-backed and limit remains the standard fixed 20.
- [x] Mount the section below plan cards only for `SUBSCRIPTION_MANAGE`; verify the existing Settings tab gate remains effective.
- [x] Run the focused Billing and Settings tests and frontend type-check.

## Task 3 — Refresh on checkout return and while checkout is open

**Seam:** Billing UI observes history rows returned by the API; a PayOS `orderCode` must match an actual row before the UI treats a receipt as present.

- [x] Add tests that a forged `status=success` without a matching history row does not show payment success, that a matching `orderCode` stops bounded polling, and that a missing receipt exposes a manual refresh after 60 seconds.
- [x] Add tests for matching callback orders from another history page, fresh polling sessions for new orders, and polling new checkout while stale return parameters remain.
- [x] Add a test that history refetches during the existing checkout dialog for at most 60 seconds.
- [x] Match the open upgrade checkout against its returned order code so a review-required receipt does not trigger a missing-receipt warning.
- [x] Change upgrade return/cancel URLs to `/settings?tab=billing` and test that PayOS `CANCELLED` returns do not show a missing-payment warning.
- [x] Update renewal reminder return/cancel URLs to the same Billing settings route and verify through its public scanner behavior.
- [x] Implement bounded five-second history refresh, timeout guidance and manual refresh, without interpreting `status` as payment evidence.
- [x] Run focused frontend/backend tests and type-check.

## Review Focus

- A user-provided URL `status=success` never creates or displays a successful payment without a matching history row.
- A `REVIEW_REQUIRED` row counts as received-money evidence and is labeled `Cần đối soát`, never as an entitlement or current case status.
- A cancelled PayOS return does not start the timeout warning.
- Unauthorized users neither see the table nor call the history endpoint.
- Rows retain the exact string PayOS order code and correctly show nullable legacy amounts.

## Completion

- Run focused tests, full relevant suites and `pnpm verify`; run backend `domain-check` if backend behavior changes.
- Review the branch against `main`, fix Critical/Important findings with RED→GREEN tests, and commit the completed work on this feature branch.
- Update the feature map with the final status and PR reference when the PR is available.
