# Frontend Form Spacing Design

## Goal

Make labels, form controls, and related action buttons comfortably distinct across the frontend without loosening intentionally dense tables or toolbars.

## Scope

- Audit application-owned forms and dialogs under `apps/frontend/src`.
- Fix only visible label-to-control, field-to-field, and action-group spacing problems.
- Reuse existing spacing utilities and shared components; do not introduce new tokens or wrappers unless the audit finds an existing shared abstraction is missing.
- Preserve intentional compact density in tables, filters, and toolbars when their controls remain legible and separated.
- Check affected layouts at mobile, tablet, and desktop widths; add focused regression coverage for reproduced defects.

## Approach

Use a screen-by-screen audit with small local fixes first. Promote a fix to a shared component only when multiple callers demonstrably share the same spacing defect. Avoid global CSS changes that could alter unrelated screens.

## Acceptance Criteria

- No audited form has a label visually touching its input/select/textarea.
- Adjacent controls and action buttons have clear separation and remain usable at narrow widths.
- No new page-level horizontal overflow, clipped text, or broken dialog layout is introduced.
- Existing compact data/table layouts remain compact unless they independently fail these criteria.
- Focused frontend tests and repository verification pass.
