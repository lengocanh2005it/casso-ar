# SMTP Settings UI Design

> Child spec of [docs/overview.md](../../../docs/overview.md). Frontend counterpart to [2026-08-11-org-branded-smtp-design.md](2026-08-11-org-branded-smtp-design.md) (the backend BYO-SMTP feature shipped in PR #91, closes issue #43). Closes issue #92. Extends [2026-08-03-frontend-design-system.md](2026-08-03-frontend-design-system.md) (shadcn/ui tokens, `Tabs`/`Card`/`Badge`/`AlertDialog` primitives) and the FE settings tab pattern established in `apps/frontend/src/features/settings/` (billing/users/templates tabs, `plans/2026-08-03-fe-reminders-copilot-reports-settings.md` Task 6).

## 0. Problem & non-goals

PR #91 shipped `GET|POST|DELETE /api/v1/smtp-config` — org-owned BYO-SMTP config, gated to `OWNER` + BUSINESS/ENTERPRISE tier — with zero frontend. `apps/frontend/src` has no SMTP-related code at all. This spec adds a 4th settings tab so an OWNER can configure, view, and remove their org's custom SMTP server without touching the API directly.

**Out of scope:**
- Any backend change — the API is already shipped and unchanged by this spec.
- The separately-proposed display-name-only sender customization (issue #43's interim-solution comment) — a different, still-unticketed feature; do not conflate.
- Real-time status polling — status changes (a background reminder-send failure flipping `CONNECTED → FAILED`) are surfaced to the org via the warning email PR #91 already sends to the OWNER, not via this UI polling. The tab reflects whatever TanStack Query's default refetch-on-focus/refetch-on-mount behavior shows — no dedicated polling interval (contrast `usePollConnections` in bank-connections, which polls only while its own dialog is open waiting on a short-lived QR handshake — a materially different situation).

## 1. Design grounding

This is an addition to an existing internal app's design system, not a new visual identity — no new palette, typeface, or component is introduced. Every primitive (`Card`, `Badge`, `Dialog`, `AlertDialog`, `Input`, `Button`, `InlineFormError`) is reused exactly as already used elsewhere in `features/settings/` and `features/bank-connections/`.

The one deliberate design decision: **status is presented as consequence, not state.** A bare `CONNECTED`/`FAILED` badge means nothing to a non-technical OWNER. Every status view pairs the badge with a one-line plain-language statement of what is currently happening to the org's outbound reminder email (*"Email nhắc nợ đang gửi từ domain của bạn"* / *"Không thể kết nối — đang tạm gửi qua Casso"*). This is the section's only true point of novelty; everything else follows existing convention.

**Badge color**: reuses the exact mapping already established in `connection-table.tsx` (`ACTIVE` → `variant="default"`, otherwise `outline`) — here, `CONNECTED` → `default`, `FAILED` → `destructive` (a real problem state, not merely "inactive").

## 2. Component structure

```
apps/frontend/src/features/settings/
  types.ts                          -- MODIFY: add SmtpConfig, SmtpConfigInput
  api/
    settings-api.ts                 -- MODIFY: add fetchSmtpConfig/saveSmtpConfig/deleteSmtpConfig
    use-settings.ts                 -- MODIFY: add useSmtpConfig/useSaveSmtpConfig/useDeleteSmtpConfig
  components/
    smtp-tab.tsx                    -- NEW: status card (4 states) + dialog trigger + delete AlertDialog
    smtp-config-dialog.tsx          -- NEW: the create/edit form
  pages/settings-page.tsx           -- MODIFY: 4th tab
```

`SmtpTab` owns all four visual states from a single `useSmtpConfig()` query plus two client-side gates (`hasPermission`, `hasPlanAccess`), checked in this order:

```
hidden (RBAC)     : !hasPermission(role, Permission.ORGANIZATION_SMTP_MANAGE) -> render nothing
locked (plan)     : hasPermission === true, !hasPlanAccess(currentPlan, PlanId.BUSINESS)
not configured    : both gates pass, query resolved to null (404)
CONNECTED         : query resolved to { ..., status: 'CONNECTED' }
FAILED            : query resolved to { ..., status: 'FAILED' }
```

**Correction from the initial design pass:** `GET /api/v1/smtp-config` itself requires `ORGANIZATION_SMTP_MANAGE` on the backend (`smtp-config.controller.ts` gates all three verbs behind the same OWNER-only permission — backend spec §7, "Covers create/replace, read, and delete"). The original version of this section assumed `billing-tab.tsx`'s pattern (unrestricted read, permission only gates the mutation buttons) applied here too; it doesn't — a non-OWNER calling `GET` would get `403`, not a valid empty/configured response. `SmtpTab` therefore follows `UsersTab`'s pattern instead (`if (!canView) return null;`, `users-tab.tsx`): the entire tab content renders nothing for a non-OWNER, and `useSmtpConfig()` is never even called (`enabled: canManage && hasPlan`), so no 403 is ever triggered. The tab's `TabsTrigger` in `settings-page.tsx` still always renders (consistent with how `UsersTab`'s trigger isn't conditionally hidden either) — only the tab's content self-gates to empty.

## 3. States & copy

| State | Card content | Actions |
|---|---|---|
| Locked (plan) | "Email server riêng" / "Gửi email nhắc nợ từ domain của bạn thay vì casso.vn." / "Tính năng dành cho gói Business trở lên." | `Nâng cấp gói` → `setSearchParams({ tab: 'billing' })` |
| Not configured | "Chưa cấu hình — email nhắc nợ đang gửi từ casso.vn." | `Cấu hình SMTP` → opens dialog |
| `CONNECTED` | Badge "Đang hoạt động" (`default`) · `{fromAddress} · {host}:{port}` · "Email nhắc nợ đang gửi từ domain của bạn." | `Sửa cấu hình`, `Xoá cấu hình` |
| `FAILED` | Badge "Gặp sự cố" (`destructive`) · `{fromAddress} · {host}:{port}` · "Không thể kết nối — đang tạm gửi qua Casso. Đã gửi email cảnh báo tới bạn." | `Sửa cấu hình`, `Xoá cấu hình` |

**Dialog form** (`SmtpConfigDialog`): fields `host` (text), `port` (number), `username` (text), `password` (password input, **always blank on open, even when editing** — the backend never returns a password to prefill, spec §1 of the backend design explicitly notes a config is opaque beyond `{ host, port, username, fromAddress, status }*`), `fromAddress` (email). Host/port/username/fromAddress are prefilled from the current `GET` response when editing; password's label carries a fixed helper line: *"Luôn phải nhập lại, kể cả khi chỉ sửa các trường khác — Casso không lưu lại mật khẩu cũ để hiển thị."* Submit button text changes with mutation state: idle → `Lưu cấu hình`, pending → `Đang kiểm tra kết nối…` (disabled) — the request is a synchronous SMTP verify+test-send server-side (backend spec §2) and can take several seconds, materially longer than any other mutation in this app; the distinct pending copy sets that expectation instead of reading as a hang. A `400 SMTP_CONNECTION_FAILED` response surfaces its message via `InlineFormError` inside the dialog (`role="alert"`, auto-focuses per the existing component) — not a toast, so the user sees exactly what failed without losing the form's filled-in fields.

**Delete flow**: `AlertDialog` (same primitive/pattern as `connection-table.tsx`'s disconnect confirm) — *"Xoá cấu hình email server riêng?"* / *"Email nhắc nợ sẽ quay về gửi qua casso.vn ngay lập tức. Bạn cần nhập lại toàn bộ thông tin, kể cả mật khẩu, nếu muốn dùng lại."* — confirm calls `DELETE /api/v1/smtp-config`.

## 4. API contract consumed (already shipped, PR #91 — no backend change)

```
GET    /api/v1/smtp-config   -> 200 { host, port, username, fromAddress, status: 'CONNECTED'|'FAILED' } | 404
POST   /api/v1/smtp-config   -> 200 { host, port, username, fromAddress, status: 'CONNECTED' } | 400 SMTP_CONNECTION_FAILED | 403
DELETE /api/v1/smtp-config   -> 200 { success: true }
```

`fetchSmtpConfig()` is this app's first "GET that treats 404 as a valid empty state, not an error" — `apiRequest` throws on any non-2xx (`lib/api-client.ts`), so the wrapper function catches the `AxiosError`, returns `null` when `error.response?.status === 404`, and rethrows anything else. Document this as the pattern to follow for the FE if a future feature needs the same "optional singleton resource" shape.

## 5. Out-of-scope decisions confirmed during grilling (2026-08-11 session)

- No enable/disable toggle independent of delete (matches backend: there is no third status).
- `UpgradeDialog` (existing, wired to the unrelated `casso:plan-limit`/quantity-limit event) is intentionally **not** reused for the plan-locked state — its copy and lack of a Billing-tab CTA don't fit "feature locked by tier," and modifying it risks the working quantity-limit flow for a different use case. The plan-locked card in `smtp-tab.tsx` is a small, local, purpose-built block instead.
