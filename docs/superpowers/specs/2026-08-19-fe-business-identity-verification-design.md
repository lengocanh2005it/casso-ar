# FE Business Identity Verification Design

> Spec for GitHub issue [#262](https://github.com/lengocanh2005it/casso-ledger/issues/262) — frontend for #245 (business identity verification: tax-code lookup + operator review). Extends the backend spec [2026-08-19-business-identity-verification-design.md](2026-08-19-business-identity-verification-design.md). Design pass done via the `frontend-design` skill; conclusion below.

## 1. Design direction

This is an established B2B SaaS app with a fixed design system (`docs/superpowers/specs/2026-08-03-frontend-design-system.md`): shadcn/ui "new-york", locked primary token `oklch(0.635 0.168 155)`, Be Vietnam Pro, `sonner` for all toasts, `InlineFormError` for all auth-form errors. None of that changes here — there is no new palette, typography, or signature element to invent. The only real design work is information architecture (where does each new state surface) and copy (what does the user read at each state).

## 2. Key discovery: no dedicated "pending review" screen needed

The original assumption (a full waiting-room page after signup) doesn't hold once the actual code is read:

- `SignupPage` (`apps/frontend/src/features/auth/pages/signup-page.tsx`) already ignores the signup response entirely — it never stores a token, just toasts and navigates to `/verify-email`. Adding `taxCode` to the request body requires **no branching on `organizationStatus`** in this page at all.
- `VerifyEmailUseCase` (backend) marks the email verified and commits that in its own transaction **before** calling `LoginUseCase.executeForUser` — so if that later call throws `ORGANIZATION_PENDING_REVIEW`/`ORGANIZATION_REJECTED` (per #245 §5), the email verification itself still succeeded. The verify-email HTTP call is where the organization's approval state actually surfaces to the frontend, not the signup call.

So the correct integration point is `VerifyEmailPage`'s existing `.catch()` on the verify-email request: branch on the error's `errorCode` instead of collapsing every failure into the current generic "invalid link" state. Two new `VerificationState` values (`'pending-review'`, `'rejected'`) replace the need for a separate page.

## 3. The three pieces

### 3.1 Signup form
Add a required `taxCode` field (`Mã số thuế`) between "Tên tổ chức" and "Họ và tên" — same raw `<label>`/`<input>` style as every other field on this form (no shadcn `Input`/`Form` here; the page doesn't use them, and introducing them for one field would be inconsistent within the same form). Light client-side format check (`^\d{10}(\d{3})?$`) reusing the existing single-`error`-string + `InlineFormError` pattern, so a malformed MST fails fast without a round trip. No other change to this page.

### 3.2 Verify-email page
`VerifyEmailPage`'s token-verification effect currently does:
```
.then(...) → store token, navigate to /onboarding
.catch(() => setState('error'))
```
Change the catch to inspect `getApiErrorCode(error)`:
- `ORGANIZATION_PENDING_REVIEW` → new `'pending-review'` state: "Email đã được xác minh. Tổ chức của bạn đang chờ được duyệt — chúng tôi sẽ gửi email khi có kết quả." No form on this screen (nothing to resend — verification already succeeded).
- `ORGANIZATION_REJECTED` → new `'rejected'` state, showing the API's own `message` (via a new `getApiErrorMessage` helper) plus a note to contact support.
- Anything else (expired/invalid token) → existing `'error'` state, unchanged.

### 3.3 Login error handling
`LoginPage`'s catch block currently always does `setError('Email hoặc mật khẩu không đúng.')`. Branch on `getApiErrorCode(error)`:
- `ORGANIZATION_PENDING_REVIEW` / `ORGANIZATION_REJECTED` → `toast.error(getApiErrorMessage(error))`, stay on the login page, no `InlineFormError`. This is a deliberate exception to "auth pages don't toast on error" (per the FE design system survey) — these two codes describe organization/account state, not a bad credential, and deserve a more visible, self-dismissing notice rather than a static inline line that reads like "you typed something wrong."
- Anything else → existing behavior (`InlineFormError`, "Email hoặc mật khẩu không đúng.").

### 3.4 Operator review — extend the existing Organizations admin page, not a new page
`AdminOrganizationsPage` already lists organizations with a Lock/Unlock `AlertDialog` toggle. Extend it:
- Add a status filter (`Select`, mirroring the exact pattern already used for member status on `AdminOrganizationMembersPage`) with options Tất cả / Đang hoạt động / Đã khóa / Chờ duyệt / Đã từ chối, backed by the URL query param via `useUrlQueryParams`.
- For a `PENDING_REVIEW` row: show the MST comparison (`taxCode`, plus a `Badge` for `taxCodeMatched` — this will always be `false` for anything that reached manual review, but the row also surfaces `taxCodeLookupName` so the operator can see what VietQR actually returned vs. what was entered) and two actions in place of the lock toggle:
  - **Duyệt** — a lightweight confirm (`AlertDialog`, same shape as the existing lock/unlock confirm) — no reason needed.
  - **Từ chối** — a `Dialog` + `Textarea` + disabled-until-filled `Button`, the exact shape already used by `DisputeDialog` (`apps/frontend/src/features/receivables/components/dispute-dialog.tsx`) for "reason required" actions.
- `REJECTED` rows show a `Badge` only — terminal state, no resubmit flow (per #245 §3), so no action.
- `ACTIVE`/`LOCKED` rows keep today's Lock/Unlock toggle unchanged.

## 4. Out of scope
- Any new visual system, palette, or typography — inherits the existing one entirely.
- Polling or auto-refresh on the verify-email pending-review screen (user finds out via the approval email, per #245 §7).
- Editing/resubmitting a rejected organization's tax code from the frontend.
