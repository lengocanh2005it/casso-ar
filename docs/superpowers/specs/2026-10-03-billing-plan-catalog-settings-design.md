# Billing plan catalog in Settings

## Context

Issue #467 targets the Billing tab after the settings refresh in `feat/audit-settings-352`. That base already fetches `GET /api/v1/plans`, displays catalog prices and limits, keeps a stable plan order, and renders a loading skeleton. It still removes the plan cards when no catalog is available, so users lose upgrade controls during a cold request failure. A failed background refresh also leaves cached values visible without explaining that they may be stale.

## Design

- Keep the existing `usePlans` query and join catalog entries to the stable FREE, STARTER, BUSINESS, ENTERPRISE card order by `planId`. Keep plan labels and upgrade eligibility UI-owned; keep all price and limit numbers server-owned.
- Label each card's catalog amount `Giá gói`. Render FREE as `Miễn phí`; render paid prices with the existing VND formatter and `/tháng` suffix.
- Keep the current loading skeleton.
- When no usable catalog is available, render all four plan cards with `—` for unavailable catalog values, show a compact alert with a retry action, and keep upgrade buttons governed by the current plan and `SUBSCRIPTION_MANAGE` permission.
- If a refresh fails while cached catalog data exists, retain those values and show a compact stale-data alert with a retry action.
- Preserve the existing Copilot row and feature copy on successful catalog loads; this issue does not add new Copilot plan content.

## Verification seam

Exercise `BillingTab` through its rendered DOM, with `usePlans` mocked. Cover catalog price labels, cold failure with working upgrade controls, cached-data refresh failure with a retry action, and the existing loading and plan-upgrade behavior. No backend endpoint or plan catalog changes are needed.

## Decision record

No ADR is warranted: the UI error states and labels are easy to reverse, and the backend remains the existing source of truth.
