# Issue #457 — Remaining viewport coverage and CI gate

## Context

The Playwright viewport harness already covers guest/auth, onboarding, and the data-table routes from #454–#456. It currently runs only on demand. The remaining product routes include charts and long data views whose layout and dark-mode contrast are not covered consistently.

## Accepted decisions

- Extend coverage to `/dashboard`, `/reports`, `/bank-connections`, `/copilot`, `/settings`, and every protected operator route: `/admin/dashboard`, `/admin/organizations`, `/admin/organizations/:organizationId/members`, and `/admin/ai-usage`. Keep the existing `/admin/login` coverage in the auth suite.
- Run the suite at the five existing viewport widths: 360, 390, 767, 900, and 1024 pixels.
- For each collection shown on these routes, exercise empty, one-item, and full-page states with deterministic API stubs. No backend or database is required.
- Exercise dashboard/report charts and ageing tables in both light and dark themes. Run dark-mode text contrast checks on every covered route. Use WCAG AA text thresholds: 4.5:1 for normal text and 3:1 for large text. Keep chart labels inside their chart containers.
- Keep Playwright retries at zero. Fix failures instead of relying on retries or snapshots.
- Add a separate `viewport` job to GitHub Actions and require that status check for PRs to `main`; keep `test:viewport` out of `pnpm verify`.

## Accessibility check boundary

Use `@axe-core/playwright` for DOM text contrast. Axe does not cover every SVG label or non-text graphic, so add explicit browser assertions for the chart labels and controls in scope; do not treat an axe pass as proof of non-text contrast. The research is recorded in `docs/superpowers/research/2026-10-07-axe-playwright-contrast.md`.

## Out of scope

The existing #454–#456 coverage is not rewritten. UI changes are limited to defects found by these browser checks. The viewport job remains a separate required check and does not become part of `pnpm verify`.
