# Transactional Email Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make emails sent by Casso to organizations Vietnamese, complete, formally branded with the Casso Ledger logo, and keep organization-to-customer emails free of Casso branding.

**Architecture:** Keep the existing Handlebars reminder-template flow unchanged. Add one small pure Casso email renderer for system emails; queue serializable plain text and CID attachment data through the existing provider port, then let Resend and SMTP translate that data to their native APIs.

**Tech Stack:** NestJS, TypeScript, BullMQ, Resend, Nodemailer, Jest, existing Handlebars dependency.

**Spec:** User-approved requirements in the conversation on 2026-08-20.

## Global Constraints

- Casso logo is used only when Casso is the sender and the organization is the recipient.
- Organization-to-customer reminder emails never receive Casso branding, even when the delivery provider falls back from organization SMTP to Resend.
- System email copy and subjects are Vietnamese and formally worded.
- Auth action URLs are absolute and come from `APP_WEB_URL`, falling back to the existing local frontend origin for development.
- Preserve the current queue, retry, tenant, and provider-selection behavior.
- Do not add React Email, another template framework, or a new dependency.
- Every new behavior gets a failing Jest test before production code.

---

### Task 1: Add the Casso system-email renderer

**Files:**
- Create: `apps/backend/src/common/email/email-attachment.ts`
- Create: `apps/backend/src/common/email/assets/casso-ledger-logo.png`
- Create: `apps/backend/src/common/email/casso-email-template.ts`
- Test: `apps/backend/src/common/email/casso-email-template.spec.ts`

**Interfaces:**
- Produces `CassoEmailContent` with `html`, `text`, and a serializable CID logo attachment.
- `buildCassoEmail(input: CassoEmailInput): CassoEmailContent` accepts a Vietnamese title, greeting, paragraphs, optional CTA, and closing.

- [ ] **Step 1: Write the failing test**

```ts
it('renders a formal Vietnamese system email with a CID logo and plain-text fallback', () => {
  const email = buildCassoEmail({
    title: 'Xác thực địa chỉ email',
    greeting: 'Kính chào Quý khách,',
    paragraphs: ['Vui lòng xác thực địa chỉ email để tiếp tục.'],
    action: { label: 'Xác thực email', url: 'https://app.casso.vn/verify?token=abc' },
  });

  expect(email.html).toContain('lang="vi"');
  expect(email.html).toContain('cid:casso-ledger-logo');
  expect(email.html).toContain('Xác thực email');
  expect(email.text).toContain('Kính chào Quý khách');
  expect(email.text).toContain('https://app.casso.vn/verify?token=abc');
  expect(email.attachments).toEqual([
    expect.objectContaining({
      filename: 'casso-ledger-logo.png',
      contentId: 'casso-ledger-logo',
      contentType: 'image/png',
    }),
  ]);
});

it('escapes dynamic HTML and URL values', () => {
  const email = buildCassoEmail({
    title: 'Thông báo',
    greeting: 'Kính chào <Doanh nghiệp>,',
    paragraphs: ['Tên "đối tác" & thông tin cần kiểm tra.'],
    action: { label: 'Mở liên kết', url: 'https://app.casso.vn/?a=1&b=2' },
  });

  expect(email.html).toContain('&lt;Doanh nghiệp&gt;');
  expect(email.html).toContain('&quot;đối tác&quot; &amp;');
  expect(email.html).toContain('a=1&amp;b=2');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend exec jest src/common/email/casso-email-template.spec.ts --runInBand`

Expected: FAIL because the renderer and attachment type do not exist.

- [ ] **Step 3: Write minimal implementation**

Implement a table-based HTML shell with inline styles, `lang="vi"`, `cid:casso-ledger-logo`, formal closing `Trân trọng,\nĐội ngũ Casso Ledger`, and the user-provided transparent PNG encoded as a base64 CID attachment. Escape all supplied text and URLs before inserting them into HTML; keep the plain-text body free of markup. This helper is used only by Casso-to-organization system messages.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend exec jest src/common/email/casso-email-template.spec.ts --runInBand`

Expected: PASS.

### Task 2: Carry text and inline attachments through the email providers

**Files:**
- Modify: `apps/backend/src/modules/notifications/application/email-provider-adapter.port.ts`
- Modify: `apps/backend/src/modules/notifications/application/email-queue.port.ts`
- Modify: `apps/backend/src/modules/notifications/infrastructure/resend-email.adapter.ts`
- Modify: `apps/backend/src/modules/notifications/infrastructure/smtp-email.adapter.ts`
- Modify: `apps/backend/src/modules/notifications/infrastructure/email-queue.processor.ts`
- Test: `apps/backend/src/modules/notifications/infrastructure/resend-email.adapter.spec.ts`
- Test: `apps/backend/src/modules/notifications/infrastructure/smtp-email.adapter.spec.ts`
- Test: `apps/backend/src/modules/notifications/infrastructure/email-queue.processor.spec.ts`

**Interfaces:**
- `EmailSendOptions = { text?: string; attachments?: EmailAttachment[] }` is optional, so organization reminder calls remain unchanged.
- `AuthEmailJob` and `OwnerAlertEmailJob` gain optional `text` and `attachments` fields.

- [ ] **Step 1: Write the failing tests**

Add assertions that Resend receives `text` plus `{ filename, content, contentId }`, SMTP maps `contentId` to Nodemailer `cid` with base64 encoding, and the worker forwards auth/owner job options without adding them to reminder sends.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm --filter @casso-ledger/backend exec jest src/modules/notifications/infrastructure/resend-email.adapter.spec.ts src/modules/notifications/infrastructure/smtp-email.adapter.spec.ts src/modules/notifications/infrastructure/email-queue.processor.spec.ts --runInBand`

Expected: FAIL on the new option/forwarding assertions.

- [ ] **Step 3: Implement the provider mapping**

Pass `text` and Resend `attachments` only when supplied; map SMTP attachments to Nodemailer `{ filename, content, encoding: 'base64', cid, contentType }`; pass the optional options from auth and owner-alert worker branches while leaving reminder arguments unchanged.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the same Jest command from Step 2. Expected: PASS.

### Task 3: Localize and brand Casso auth emails, and fix absolute links

**Files:**
- Modify: `apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.ts`
- Modify: `apps/backend/.env.example`
- Test: `apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.spec.ts`

**Interfaces:**
- The public auth sender methods remain unchanged.
- Relative paths are normalized at the infrastructure boundary using `APP_WEB_URL ?? CORS_ORIGIN ?? 'http://localhost:5173'`.

- [ ] **Step 1: Write the failing tests**

Assert verification/reset/invite jobs use absolute URLs, Vietnamese subjects/body text, a plain-text body, and a Casso CID logo; assert dynamic organization text is HTML-escaped.

- [ ] **Step 2: Run focused auth tests and verify RED**

Run: `pnpm --filter @casso-ledger/backend exec jest src/modules/auth/infrastructure/resend-auth-email-sender.adapter.spec.ts --runInBand`

Expected: FAIL because the current jobs contain English copy, relative URLs, and no logo/text payload.

- [ ] **Step 3: Implement the auth email content**

Use `buildCassoEmail` for verification, password reset, invitation, member blocked/unblocked, organization approved, and organization rejected messages. Sanitize organization names in subjects and normalize relative URLs before rendering. These are Casso-to-organization messages.

- [ ] **Step 4: Add the production URL setting**

Add `APP_WEB_URL=https://app.casso.vn` to `.env.example`; do not edit the ignored local `.env`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the auth test command from Step 2. Expected: PASS.

### Task 4: Apply the same Casso-only branding to system owner alerts

**Files:**
- Modify: `apps/backend/src/modules/notifications/infrastructure/bank-connection-status.listener.ts`
- Modify: `apps/backend/src/modules/payos/application/renewal-reminder-scanner.service.ts`
- Modify: `apps/backend/src/modules/notifications/infrastructure/email-queue.processor.ts`
- Test: `apps/backend/src/modules/notifications/infrastructure/bank-connection-status.listener.spec.ts`
- Test: `apps/backend/src/modules/payos/application/renewal-reminder-scanner.service.spec.ts`
- Test: `apps/backend/src/modules/notifications/infrastructure/email-queue.processor.spec.ts`

- [ ] **Step 1: Write the failing tests**

Assert bank-connection alerts, subscription renewal alerts, and SMTP failure warnings sent by Casso to organization owners include Vietnamese plain text and the Casso CID attachment; assert customer reminder jobs still have no Casso attachment, including Resend fallback jobs.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm --filter @casso-ledger/backend exec jest src/modules/notifications/infrastructure/bank-connection-status.listener.spec.ts src/modules/payos/application/renewal-reminder-scanner.service.spec.ts src/modules/notifications/infrastructure/email-queue.processor.spec.ts --runInBand`

Expected: FAIL on the new content/branding assertions.

- [ ] **Step 3: Implement the shared Casso content path**

Build these Casso-to-organization messages through `buildCassoEmail`, forward their `text` and attachments in owner-alert jobs, and use the same helper for the Resend SMTP-failure warning. Leave `EmailService.sendReminderEmail` and its organization-owned template body untouched; provider fallback must not add the Casso logo to it.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the same Jest command from Step 2. Expected: PASS.

### Task 5: Full verification

**Files:**
- Verify: all changed files above.

- [ ] **Step 1: Run the focused email suite**

Run: `pnpm --filter @casso-ledger/backend exec jest src/common/email src/modules/auth/infrastructure/resend-auth-email-sender.adapter.spec.ts src/modules/notifications/infrastructure src/modules/payos/application/renewal-reminder-scanner.service.spec.ts --runInBand`

Expected: PASS with zero failures.

- [ ] **Step 2: Run backend type-check and architecture verification**

Run: `pnpm --filter @casso-ledger/backend type-check` and `pnpm --filter @casso-ledger/backend arch-check`

Expected: exit code 0.

- [ ] **Step 3: Run repository verification**

Run: `pnpm verify`

Expected: exit code 0.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors, only the intended source/tests/plan changes, and no `.env` tracked.
