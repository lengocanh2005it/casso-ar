# Org-Branded Reminder Emails via Custom SMTP (BYO-SMTP) Design

> Child spec of [docs/overview.md](../../../docs/overview.md) §9 (Pricing & Billing Model, ENTERPRISE tier note), supersedes the Resend-managed-domain design originally scoped in issue #43. Extends [2026-08-03-email-notification-service-design.md](2026-08-03-email-notification-service-design.md) (`IEmailProviderAdapter`, `EmailService`, `email-queue`). See [ADR-0006](../../adr/0006-byo-smtp-for-org-branded-reminder-emails.md) for the Resend-domain-vs-BYO-SMTP trade-off. See issue #90 for the general plan-catalog this spec deliberately did not build (that catalog later read this spec's flat `canUseCustomSmtp` field as-is, rather than replacing it).

## 0. Problem & non-goals

Every reminder email today sends `from` Casso's own verified domain (`RESEND_FROM_ADDRESS`), with `Reply-To` set to the org OWNER's email as a trust substitute (email-notification-service spec §1). For BUSINESS/ENTERPRISE orgs, this isn't enough — SMEs using a third-party AR tool don't want `from: noreply@casso-ledger.vn` exposed to their own customers.

**In scope:** letting a BUSINESS/ENTERPRISE org supply its own SMTP server (host/port/username/password/from-address) — modeled on Supabase's per-project custom SMTP setting — so reminder emails send `from` the org's own domain through the org's own mail server.

**Out of scope (unaffected by this spec):**
- Auth emails (invite, password reset, email verification) — always send via Casso's own Resend domain, unconditionally. `ResendAuthEmailSenderAdapter`/`IAuthEmailSender` are untouched.
- Display-name-only customization (`From: "Công ty ABC (qua Casso)" <noreply@casso-ledger.vn>`, all tiers, no SMTP/DNS) — a separate, still-unshipped ticket referenced in issue #43's interim-solution comment. Not built here, but §5 below reserves the field so it composes with this feature once it exists.
- A general plan-catalog / feature-flag mechanism (issue #90, later built) — this spec adds one flat boolean to `Subscription`, matching the existing `copilotChatMonthlyLimit`-style convention; #90's `PLAN_CATALOG` reads that same field per plan rather than reworking it.
- DNS records, domain verification polling/webhooks, stale-verification detection — none of that exists in this model. There is no DNS propagation delay to wait out; see §2.

## 1. Domain model

New module `apps/backend/src/modules/smtp-config/`, 4-layer, mirroring `email-templates` (an existing org-owned-configuration module that `notifications` already consumes only through a port — see ADR-0006).

```
OrganizationSmtpConfig (domain, no NestJS/TypeORM imports)
  id: string
  organizationId: string
  host: string
  port: number
  username: string
  encryptedPassword: string        // AES-256-GCM ciphertext, see §3
  fromAddress: string
  status: SmtpConfigStatus         // 'CONNECTED' | 'FAILED' — no PENDING/UNTESTED state
  createdAt: Date
  updatedAt: Date
  version: number                  // @VersionColumn, optimistic lock on the CONNECTED→FAILED flip
```

One config per organization (`@Unique(['organizationId'])` on the ORM entity, same shape as `SubscriptionOrmEntity`).

**Why only two states, never three:** verification here is a synchronous SMTP `connect()` + test-send, not a DNS record that takes minutes-to-hours to propagate (contrast the original issue #43 Resend-domain design, which needed a `pending` state exactly because of that delay). A config is only ever persisted once a real test send has already succeeded — see §2. This eliminates an entire class of "saved but never got around to testing it" bugs by construction.

**Why `CONNECTED`, not `VERIFIED`:** `User.isEmailVerified`/`EmailVerifiedGuard` already own the term "verified" for a different concept (a person's own email address confirmed at signup). Reusing it here for "this SMTP server accepted our test send" would collide two different meanings of the same word inside the same domain (email). `CONNECTED`/`FAILED` names the actual mechanism (a successful/failed SMTP connection+send), not an identity claim.

## 2. Test-then-save verification flow (no polling, no webhook)

```
POST /smtp-config  { host, port, username, password, fromAddress }
  1. Build a nodemailer transporter from the submitted fields (not yet persisted).
  2. transporter.verify() — SMTP handshake/auth check.
  3. transporter.sendMail() — send one real test email to the organization OWNER's address
     (Membership(role=OWNER) → User.email, the same lookup EmailService already does for Reply-To).
  4. Only on success: persist OrganizationSmtpConfig with status=CONNECTED (upsert — replaces
     any existing row for the organization, e.g. when rotating credentials).
  5. On any failure (auth rejected, connection refused, timeout): throw AppError(SMTP_CONNECTION_FAILED),
     do NOT persist anything. The org sees the raw failure reason and can retry the form.
```

No record is ever created in a state other than `CONNECTED`. There is no "save first, verify later" path (contrast §1 of the original issue #43 draft) — this is possible only because SMTP verification is a synchronous network call with no propagation delay, unlike DNS.

## 3. Secret storage — reuse, don't reinvent

`apps/backend/src/modules/bank-connections/application/token-encryption.ts` already provides `encryptToken`/`decryptToken` (AES-256-GCM, 12-byte IV + 16-byte auth tag + ciphertext, base64, keyed by a 64-hex-char/32-byte env var) for the CASSO bank-connection access token. `OrganizationSmtpConfig.encryptedPassword` reuses these exact functions, keyed by the same `ACCESS_TOKEN_ENCRYPTION_KEY` env var — no new key, no new encryption scheme. `TestAndSaveSmtpConfigUseCase` calls `encryptToken` before persisting; `SmtpEmailAdapter` calls `decryptToken` when building a transporter for an actual send.

## 4. Sending: per-organization provider resolution

`IEmailProviderAdapter` (email-notification-service spec §1) is unchanged as a port — `send(to, subject, html, metadata, replyTo?)`. What changes is *which implementation* handles a given send. `EmailQueueProcessor` currently injects one `EMAIL_PROVIDER_ADAPTER` (`ResendEmailAdapter`) at DI time; that's no longer correct once different organizations may route through different servers.

```
IEmailProviderResolver (application port, owned by notifications)
  resolve(organizationId: string, forceProvider?: 'RESEND'): Promise<IEmailProviderAdapter>

EmailProviderResolver implements IEmailProviderResolver (notifications/infrastructure)
  - forceProvider === 'RESEND' → always the injected ResendEmailAdapter (used for the
    failure-fallback requeue in §6, and for the SMTP-failure warning email itself — never
    route a warning about a broken SMTP server back through that same broken server).
  - otherwise: look up OrganizationSmtpConfig by organizationId. If found and
    status === CONNECTED → decrypt the password, build a new SmtpEmailAdapter for this send.
    Otherwise → the injected ResendEmailAdapter.

SmtpEmailAdapter implements IEmailProviderAdapter (notifications/infrastructure)
  - Wraps nodemailer, constructed per-call from a decrypted OrganizationSmtpConfig
    (not a DI singleton — every organization has different credentials).
  - `from` is the org's own OrganizationSmtpConfig.fromAddress, not RESEND_FROM_ADDRESS.
```

`EmailQueueProcessor.processReminderEmail` calls `resolver.resolve(organizationId, job.data.forceProvider)` to get the adapter for *this* send, instead of using its constructor-injected adapter directly. The port/impl split (`IEmailProviderResolver` in `application`, `EmailProviderResolver` in `infrastructure`) exists because resolving requires constructing a concrete `SmtpEmailAdapter` — an infrastructure-layer concern — and `application` code must not import concrete adapters (AGENTS.md layering rule); `EmailQueueProcessor` (already infrastructure) depends on the port, satisfied by the infrastructure implementation.

No `from`-address validation against the SMTP host's domain (see grilling decision) — a real SMTP server already rejects a mismatched `from` more reliably than any heuristic Casso could write, and the test-send in §2 already exercises that path.

## 5. Failure handling: retry, fallback, and one warning — no health-check cron

Reuses the existing `email-queue` job config unchanged: `attempts: 3, backoff: { type: 'exponential', delay: 5000 }` (email-notification-service spec §2). No new retry mechanism is introduced for the SMTP path — this is deliberate reuse, not a gap.

```
EmailQueueProcessor.onFailed(job), on the job's FINAL exhausted attempt:

  if job.data.forceProvider === 'RESEND':
    // This was already the Resend-fallback retry (below) and it also failed —
    // a real, final failure. Behave exactly as email-notification-service spec §2 today:
    ReminderExecution.status = FAILED. Stop. (No further fallback exists.)

  else:
    config = smtpConfigRepo.findByOrganizationId(organizationId)
    if config exists and config.status === CONNECTED:
      // The org's SMTP server is what failed. Do NOT mark ReminderExecution FAILED yet —
      // the reminder itself isn't lost, it's about to be retried through Resend.
      1. smtpConfigRepo.save({ ...config, status: FAILED })   // CONNECTED → FAILED transition
      2. Enqueue ONE warning email to the org OWNER via the forced-Resend path
         (subject: "Email server riêng của bạn đang gặp sự cố" or similar — Vietnamese,
         per AGENTS.md error-message convention), only because this branch only runs on
         the CONNECTED→FAILED transition itself, never on a repeat failure (subsequent
         reminders for this org now resolve straight to Resend on their first attempt,
         per §4 — they never reach this branch again until the org fixes their server and
         re-verifies, which can only ever produce a fresh CONNECTED row per §2).
      3. Re-enqueue THIS reminder with the SAME reminderExecutionId but jobId
         `${reminderExecutionId}:resend-fallback`, `forceProvider: 'RESEND'`, same
         attempts/backoff config. Do NOT write ReminderExecution.status = FAILED here —
         it stays PENDING so the fallback job's processReminderEmail (which checks
         `status !== PENDING → skip`, existing dedup guard) still runs and can still set SENT.
    else:
      // No SMTP config, or already FAILED (this org has no working custom sender to blame) —
      // this is Resend itself failing. Unchanged existing behavior.
      ReminderExecution.status = FAILED.
```

No dedicated health-check cron polls `CONNECTED` configs. Detection is entirely reactive, riding on the reminder cadence that already exists (ADR-0004) — cheap because the alternative (a new scheduled job pinging every org's SMTP server) has no evidence of being needed at current scale.

## 6. Plan-tier gating

`Subscription` gains one flat boolean field, following the existing `copilotChatMonthlyLimit`-style convention (a per-plan value hard-coded in the relevant `Subscription.createXxx()` factory) rather than a general plan-catalog (issue #90, built afterward — see below):

```
Subscription.canUseCustomSmtp: boolean   // false for FREE/STARTER, true for BUSINESS/ENTERPRISE
```

`Subscription.createFree()` sets `canUseCustomSmtp: false`. At the time this spec was written there was no `createBusiness()`/`createEnterprise()` factory yet (only FREE was implemented, per the then-existing `ponytail:` comment in `subscription.ts`) — this spec deliberately did not add one; it only added the field so that whichever future work added those factories would have the field to set. Issue #90's `PLAN_CATALOG` later added `createBusiness()`/`createEnterprise()` and set `canUseCustomSmtp: true` for both from the catalog, matching the comment above. `TestAndSaveSmtpConfigUseCase` checks `subscription.canUseCustomSmtp` before attempting the test-send, throwing `AppError(FORBIDDEN)` otherwise.

On downgrade, an existing `OrganizationSmtpConfig` row is left untouched — the gate is enforced at read/send time (`canUseCustomSmtp` false ⇒ `EmailProviderResolver` never even reaches the org's config lookup), not by deleting data. Re-upgrading restores custom-domain sending immediately with no re-entry of credentials.

## 7. RBAC

New permission `Permission.ORGANIZATION_SMTP_MANAGE`, granted only to `Role.OWNER` (via `ROLE_PERMISSIONS[Role.OWNER] = Object.values(Permission)`, same OWNER-exclusivity mechanism already used for `BANK_CONNECTION_MANAGE` — simply omit the new permission from every other role's explicit array in `packages/shared-types/src/role-permissions.ts`). Covers create/replace (`POST /smtp-config`), read (`GET /smtp-config` — never returns `encryptedPassword`), and delete (`DELETE /smtp-config`).

Rationale (from grilling): SMTP credentials control the org's actual outbound mail identity — higher-stakes than ordinary billing/settings actions already open to `FINANCE_MANAGER`.

## 8. API surface

```
GET    /api/v1/smtp-config      → { host, port, username, fromAddress, status } | 404   (no encryptedPassword)
POST   /api/v1/smtp-config      → test-then-save (§2); upserts; 400 SMTP_CONNECTION_FAILED on failure
DELETE /api/v1/smtp-config      → removes the org's config (falls back to Resend + Reply-To immediately)
```

All three behind `@RequirePermission(Permission.ORGANIZATION_SMTP_MANAGE)` + `PermissionGuard`, scoped by `TenantContextService.getOrganizationId()` like every other tenant write.

## 9. New error code

```
SMTP_CONNECTION_FAILED  400  "Failed to connect to the SMTP server or send the test email"
```

Added to the `ErrorCode` enum (AGENTS.md) — distinct from the existing `EMAIL_SEND_FAILED` (500, a Resend-side error on a real reminder send), because this one is a 400-class "your input didn't work" surfaced directly to the org while filling in the form, not a 500-class platform error.

## 10. Out of scope / open questions (do not block implementation)

- No enable/disable toggle independent of `status` (grilling decision — YAGNI; deleting and re-adding the config is the "disable" path).
- No org-facing UI for the CONNECTED→FAILED warning beyond the one email in §5 — a Settings-page banner reflecting `status` is presentation-layer work for whichever plan builds the frontend Settings page (Lane C, Plan #18-21 per CLAUDE.md), not blocked by this spec.
- Multiple SMTP configs per organization (e.g., separate senders for different reminder stages) — no evidence of demand; one config per org for now.
