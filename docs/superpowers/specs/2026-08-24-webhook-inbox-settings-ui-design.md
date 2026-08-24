# Webhook Inbox — Settings UI (frontend)

**Issue:** #235
**Branch:** `feat/webhook-inbox-reprocess`
**Status:** Approved for planning

## Context

When a bank-connection webhook fails processing, it sits dead-lettered with no
way for anyone to retry it from the UI. The backend already ships everything
needed (PR #147):

- `GET /api/v1/webhooks/inbox` — paginated list, optional `status` /
  `providerTransactionId` filters (`ListWebhookInboxQueryDto`)
- `POST /api/v1/webhooks/inbox/:id/reprocess` — FAILED-only, deterministic
  `jobId` (idempotent)
- Permission `WEBHOOK_INBOX_READ`, gating both endpoints via `PermissionGuard`

No frontend code references `webhooks/inbox` today.

## Placement decision (deviates from the issue text)

Issue #235 describes this as a "Casso Admin (operator-only)" screen. That
contradicts the actual RBAC: `WEBHOOK_INBOX_READ` is granted only to
`OWNER` and `FINANCE_MANAGER` (`packages/shared-types/src/role-permissions.ts`)
— organization-level roles, not the cross-org `Operator` role that Casso
Admin's `AdminAuthGuard` checks. `ListWebhookInboxUseCase` also scopes every
query by `TenantContextService.getOrganizationId()`, confirming this is a
per-organization inbox, not a cross-org one.

This is the same situation already resolved for issue #236 (audit log
viewer, PR #327): placed in the tenant app's **Settings** tabs, not Casso
Admin, because the permission is org-scoped. This spec follows that
precedent. No backend changes are needed or in scope.

## Architecture

New feature folder `apps/frontend/src/features/webhook-inbox/`, wired as a
new "Webhook" tab in `features/settings/pages/settings-page.tsx`, gated by
`hasPermission(role, Permission.WEBHOOK_INBOX_READ)` (tab shows locked/hidden
per the existing `SettingsTabConfig.locked` pattern — never a disabled button
per `.claude/rules/frontend.md`'s RBAC rule).

Filter/pagination/expanded-row state lives in the URL via
`useUrlQueryParams`, matching `audit-log-tab.tsx` — not local React state —
so filters survive reload/back-navigation.

### Files

```
features/webhook-inbox/
  types.ts                          WebhookInboxItem, WebhookInboxStatus, query/filter types
  labels.ts                         STATUS_LABELS (Vietnamese)
  api/
    webhook-inbox-api.ts            fetchWebhookInbox(filters, page, limit), reprocessWebhookInbox(id)
    use-webhook-inbox.ts            useWebhookInbox(query), useReprocessWebhook()
    webhook-inbox-api.spec.ts
  components/
    webhook-inbox-filters.tsx       status Select + providerTransactionId search input
    webhook-inbox-table.tsx         table + expand-in-row detail + reprocess action
    webhook-inbox-tab.tsx           page-level composition (filters + SectionCard table + pager)
    webhook-inbox-tab.spec.tsx
```

### Data flow

- `useWebhookInbox({ status, providerTransactionId, page, limit })` →
  `useQuery`, queryKey `['webhook-inbox', filters, page, limit]`, calls
  `GET /api/v1/webhooks/inbox`.
- `useReprocessWebhook()` → `useMutation`, calls
  `POST /api/v1/webhooks/inbox/:id/reprocess`.
  - `onSuccess`: `toast.success('Đã xử lý lại webhook.')` +
    `queryClient.invalidateQueries({ queryKey: ['webhook-inbox'] })`
  - `onError`: `toast.error(getResponseErrorMessage(error, 'Không thể xử lý lại webhook.'))`

## Components

**`webhook-inbox-tab.tsx`** — same shape as `audit-log-tab.tsx`: reads
filter/page state from `useUrlQueryParams`, renders `WebhookInboxFiltersBar`,
a `SectionCard` containing loading skeleton (`TableSkeleton`) / error text /
`EmptyState` / `WebhookInboxTable`, and a Trước/Sau pager below.

**`webhook-inbox-filters.tsx`** — a `Select` for status (Tất cả / RECEIVED /
PROCESSED / FAILED) and a text input for `providerTransactionId`. Changing
either resets `page` to 1 (matches `audit-log-filters.tsx`'s
`updateFilterValues`).

**`webhook-inbox-table.tsx`** — columns: Thời điểm nhận (`receivedAt`),
Trạng thái (`Badge`: `outline` for RECEIVED, `secondary` for PROCESSED,
`destructive` for FAILED), Bank connection / provider transaction id
(`TruncatedCopyId`), Số lần thử lại (`retryCount`), a "Chi tiết" toggle
button. Expanding a row (same `expanded` URL param + `Fragment`/`DetailRow`
pattern as `audit-log-table.tsx`) shows `rawPayload` pretty-printed JSON and
the full `errorMessage`.

A "Xử lý lại" button renders only when `status === 'FAILED'` (the backend
already 409s on any other status — the frontend simply never offers the
action outside that state, mirroring the RBAC "hide, don't disable"
convention). It's wrapped in an `AlertDialog` ("Xử lý lại webhook này?" /
"Hệ thống sẽ thử xử lý lại webhook này với dữ liệu đã nhận. Không xoá dữ
liệu hiện có." / Hủy / Xác nhận), matching the block/unblock confirm pattern
in `users-tab.tsx`. Confirming calls `useReprocessWebhook().mutate(id)`.

## Error handling

- List load failure: inline `role="alert"` error text (matches
  `audit-log-tab.tsx`).
- Empty list: `EmptyState` (icon + Vietnamese copy), matches `AuditLogEmpty`.
- Reprocess failure: toast only (row stays as-is, user can retry the action).

## Out of scope

- Any backend change (list/reprocess endpoints, permissions) — already shipped.
- Casso Admin / cross-org placement (see placement decision above).
- Bulk reprocess, auto-refresh/polling, websocket/live updates.
- Editing or deleting inbox rows.

## Testing plan (TDD)

Per `.claude/rules/frontend.md` and AGENTS.md's TDD workflow, tests are
written before the corresponding component/function:

- `webhook-inbox-api.spec.ts` — request shape for `fetchWebhookInbox` /
  `reprocessWebhookInbox` (mirrors `audit-logs-api.spec.ts`).
- `webhook-inbox-tab.spec.tsx` —
  1. renders the list from a mocked query response
  2. changing the status filter updates the query params / refetches
  3. "Xử lý lại" is present only on FAILED rows, absent on RECEIVED/PROCESSED
  4. confirming the dialog calls the reprocess mutation with the row's id
  5. success shows a toast and the list refetches
  6. failure shows an error toast

No backend tests needed — no backend code changes in this ticket.
