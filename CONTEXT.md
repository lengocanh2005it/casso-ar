# Context — Casso AR

## What is this?

A B2B SaaS platform for automating accounts receivable management and collection for Vietnamese businesses. It directly connects to real-time bank transaction data through **Casso Flow** — a third-party bank-aggregation service (flow.casso.vn), unrelated to this product despite the name collision (see "Casso Flow" glossary entry below).

## Product Positioning

*A platform that automates the entire accounts receivable lifecycle based on real-time bank transaction data* — its key differentiator is direct connection to actual cash flow, not merely invoice-list management.

## Core Domain Entities

| Entity | Description | Key Fields |
|--------|-------------|------------|
| **Organization** | Tenant boundary, organization unit | `id`, `name`, `status` |
| **User** | Login account belonging to 1+ organization | `id`, `email`, `name` |
| **Operator** | Casso's own staff who manage the platform across all organizations — not scoped to any single organization, not a `Membership`/`Role`. Identified by a flag on `User`, authorized through a guard separate from `PermissionGuard` (research, not yet built — issue #98) | `id` (= `User.id`) |
| **OperatorAuditLog** | Audit trail for cross-org `Operator` actions (organization, membership, or invitation changes), separate from `AuditLog` because the Operator plane is not tenant-RBAC-scoped. `reason` is free-text and answers "why" (used by reject); `verificationMethod` (issue #337, not yet built) is a fixed enum and answers "how ownership/authority was confirmed" — required on `ORGANIZATION_APPROVED`, absent on every other `actionType`. The two are never interchangeable: a `reason` string does not satisfy the approval-evidence requirement | `id`, `operatorId`, `organizationId`, `actionType`, `membershipId`/`inviteId`, `reason`, `verificationMethod` |
| **OrganizationVerificationMethod** | Proposed (issue #337, not yet built). Fixed enum naming how an `Operator` confirmed the applicant's authority over an organization before approving it: `TAX_CODE_NAME_MATCH_ONLY` (accepted the automatic VietQR match as sufficient — the weakest evidence, not itself an approval), `BUSINESS_REGISTRATION_DOCUMENT`, `PHONE_CALL`, `OTHER` (paired with `OperatorAuditLog.reason` for detail). Lives only on `OperatorAuditLog.verificationMethod` — `Organization` itself does not carry it | — (no local table; a field on `OperatorAuditLog`) |
| **Membership** | User ↔ Organization link with a role. `status: ACTIVE \| BLOCKED` gates that one org only — a `User` in 1+ organizations keeps full access to the others (issue #178, shipped PR #182) | `userId`, `organizationId`, `role`, `status`, `blockedAt` |
| **MembershipInvite** | Invitation for an email address to join one organization. It is **pending** while `acceptedAt` is null; expiry controls whether its token can be accepted, not whether the pending invitation is listed. Resend replaces it with a new invitation/token and resets expiry; revoke makes the pending invitation unusable | `id`, `organizationId`, `email`, `role`, `expiresAt`, `acceptedAt` |
| **OwnershipTransferRequest** | Proposed (issue #322, not yet built). Request to move an `Organization`'s sole `OWNER` role to another existing `Membership`. State machine: `PENDING_OTP_CONFIRMATION` (current `OWNER` confirms with password+OTP, reusing `ChangePasswordRequestUseCase`'s mechanism) → `PENDING_ACCEPTANCE` (target has a window to accept or decline) → `ACCEPTED` \| `DECLINED` \| `CANCELLED` \| `EXPIRED`. No secret accept token — unlike `MembershipInvite` (pre-auth, where the token is the only credential), the target already has an account, so acceptance is an authenticated action gated by JWT `userId` match instead (ADR-0025). Accepting re-validates every precondition at that moment rather than trusting request-time state; completion atomically promotes the target and demotes the prior `OWNER` to `FINANCE_MANAGER` | `id`, `organizationId`, `fromMembershipId`, `toMembershipId`, `status`, `otpExpiresAt`, `acceptanceExpiresAt`, `resolvedAt` |
| **PendingSignup** | Shipped (issue #336, PR #338). Holds a would-be organization owner's signup input (applicant name, email, password hash, org name, tax code, VietQR lookup result) between signup submission and email OTP verification. `Organization`/`User`/`Membership`/`Subscription`/bootstrap data are **not** created at signup time — verification atomically provisions all of them from the `PendingSignup` row (the exact transaction `SignupUseCase` ran before #336), then deletes the row. One active (non-expired) `PendingSignup` per email and per tax code — a duplicate signup attempt while one is pending is rejected (`CONFLICT`), not silently replaced; resend generates a new OTP and resets `expiresAt`, mirroring `MembershipInvite`'s resend. TTL enforced by lazy reclaim at next access (create/verify/resend) — deliberately not a cron, following the same precedent as `OwnershipTransferRequest`/`IdempotencyKey` (ADR-0015), despite carrying a password hash, since the TTL window is short (10 minutes, same as the existing OTP TTL). Verifying an already-provisioned `User` created by the pre-#336 signup flow (`emailVerifiedAt: null`) remains a separate legacy path this entity does not touch | `id`, `email`, `passwordHash`, `name`, `organizationName`, `taxCode`, `taxCodeMatched`, `taxCodeLookupName`, `otpHash`, `expiresAt`, `createdAt` |
| **Customer** | Customer who owes money | `id`, `organizationId`, `name`, `taxCode`, `creditLimit`, `defaultPaymentTermDays` |
| **Invoice** | Invoice | `id`, `organizationId`, `customerId`, `invoiceNumber`, `totalAmount`, `sourceType` |
| **Receivable** | Amount receivable | `id`, `organizationId`, `customerId`, `originalAmount`, `paidAmount`, `dueDate`, `status` |
| **Payment** | Payment from a bank transaction | `id`, `organizationId`, `customerId`, `totalAmount`, `allocatedAmount`, `payerName` |
| **PaymentAllocation** | Payment → receivable allocation | `id`, `paymentId`, `receivableId`, `allocatedAmount`, `deletedAt` |
| **BankTransaction** | Normalized transaction; optional persisted AI matching recommendation is advisory only | `id`, `organizationId`, `status`, `amount`, `referenceCode`, `aiRecommendation` |
| **WebhookInbox** | Raw webhook payload | `id`, `providerTransactionId`, `status`, `payload` |
| **IdempotencyKey** | Dedup record for a POST request carrying an `Idempotency-Key` header. `status: PENDING` normally means "another request is executing this key, reject duplicates" — but a `PENDING` row older than 5 minutes is reclaimed as stale (see ADR-0015): deleted and re-executed rather than rejected forever | `id`, `organizationId`, `endpoint`, `key`, `requestHash`, `status`, `createdAt` |
| **Dispute** | Dispute | `id`, `receivableId`, `status` |
| **ReminderPolicy** | Reminder policy by customer group | `id`, `customerGroup`, `escalationThresholdDays` |
| **ReminderExecution** | Reminder sending history | `id`, `reminderRuleId`, `status`, `sentAt` |
| **EmailTemplate** | HTML + Handlebars email template | `id`, `bodyHtml`, `isDefault` |
| **CollectionActivity** | Denormalized, INSERT-only timeline | `id`, `receivableId`, `eventType` |
| **InternalTask** | Internal ESCALATION/MANUAL task | `id`, `receivableId`, `assignedToUserId`, `status` |
| **ReceivableBalanceHistory** | Immutable snapshots of a receivable's balance and status at each balance/status transition; the source for historical outstanding balances, not an audit log or event-sourced ledger. A payment without an allocation is not a balance transition. A snapshot may carry transition provenance. It follows the receivable's lifecycle and is not independently hard-deleted. `effectiveAt` is when the transition became effective in the domain, not when the bank transaction originally occurred. Receivables/Payments own transitions; balance history owns snapshots and historical queries; reporting only reads them. It is an immutable record, not an aggregate root | `id`, `receivableId`, `status`, `remainingAmount`, `effectiveAt`, `changeSource`, `actorType`, `actorUserId`, `reasonCode`, `note`, `transitionReferenceId` |
| **LedgerEvent** | Immutable, org-scoped record of one AR money movement (see "AR Ledger" below). Unlike `ReceivableBalanceHistory` (a per-receivable *snapshot* of the resulting balance), a `LedgerEvent` is a per-subject *movement* (a signed amount) against either a `Receivable` or a `Payment`'s unallocated (credit) balance. It is additive alongside the persisted rollups and `ReceivableBalanceHistory`, not a replacement for either | `id`, `organizationId`, `subjectType`, `subjectId`, `kind`, `amount`, `effectiveAt`, `transitionReferenceId` |
| **AuditLog** | Actor-oriented record of who performed an action and what changed; general audit history, not the source for historical receivable balances | `id`, `entityType`, `entityId`, `beforeState`, `afterState` |
| **BankConnection** | An organization's linked bank account, read through a `CassoFlowAuthorization`. The bank itself is linked directly on Casso Flow's own site, never through this product. `accountNumber` is the correlation key inbound Casso Flow webhooks are matched against, and is unique system-wide — one bank account cannot be claimed by two organizations. `cassoFlowAuthorizationId` is nullable: rows created before `CassoFlowAuthorization` existed have none, keep working for disconnect, but cannot be key-rotated until reconnected through the current flow | `id`, `organizationId`, `cassoFlowAuthorizationId`, `accountNumber`, `accountHolderName`, `status` |
| **CassoFlowAuthorization** | This product's authorization to call Casso Flow's API with one API Key — corresponds to one Casso Flow "business" (`businessId`, the identifier Casso Flow returns, is how a re-pasted API Key is recognized as belonging to an authorization already on file, instead of creating a duplicate). One authorization can cover several linked `BankConnection`s, because a business may have more than one bank account linked on Casso Flow's own site. Owns the encrypted API Key and the webhook-verification secret (`encryptedSecureToken`) — both are registered/verified once per authorization, never per `BankConnection`. Rotating the API Key re-verifies every `BankConnection` under it: an account no longer present in the new key's response keeps its prior state (never auto-disconnected), and newly-discovered accounts are offered, never auto-connected | `id`, `organizationId`, `businessId`, `encryptedApiKey`, `encryptedSecureToken`, `createdAt` |
| **Casso Flow** | Third-party bank-aggregation SaaS (flow.casso.vn) this product integrates with for real-time transaction data — **not** this product itself, despite sharing the "Casso" name. A business links its bank account(s) directly on Casso Flow's own site; this product only reads account info via Casso Flow's OAuth and receives its webhook | — (external system, no local table) |
| **Subscription** | Subscription plan | `id`, `organizationId`, `plan`, `status` |
| **PlanUpgradeOrder** | One-off PayOS payment to move a `Subscription` to a strictly higher tier | `id`, `orderCode`, `organizationId`, `targetPlanId`, `status` |
| **PeriodCharge** | The recurring per-billing-period PayOS payment a paid-tier `Subscription` must make to stay on that tier (PayOS has no card-on-file/auto-charge, so this is a distinct concept from `PlanUpgradeOrder` — same tier, not a higher one, and repeats every period). "Renewal" = paying the `PeriodCharge` for the current period | `id`, `orderCode`, `organizationId`, `planId`, `periodStart`, `periodEnd`, `status` |
| **OrganizationSmtpConfig** | Org's own SMTP server for sending org-branded reminder emails (BUSINESS+ only). One per org; only ever exists as `CONNECTED` or `FAILED` — a failed test-send is never persisted | `id`, `organizationId`, `host`, `port`, `username`, `encryptedPassword`, `fromAddress`, `status` |
| **CopilotConversation** | Chat conversation with AI | `id`, `organizationId` |
| **CopilotPendingAction** | Action awaiting user confirmation | `id`, `conversationId`, `status` |
| **Alert** | Owner-facing, in-app, actionable event (bank connection needs reauth/errored, SMTP FAILED, reminder scan summary). Not the same as `notifications/` (the email queue) — see ADR-0013. `readAt: null` = UNREAD, non-null = READ (one-way transition, not a full state machine). One unread `Alert` per `(userId, entityType, entityId, type)` — a repeat event refreshes `createdAt` instead of inserting a duplicate row | `id`, `organizationId`, `userId`, `type`, `entityType`, `entityId`, `readAt`, `createdAt` |

## Collection Terms

| Term | Meaning |
|------|---------|
| **Overdue receivable** | A `Receivable` whose due date has passed while it remains `OPEN` or `PARTIALLY_PAID` with a positive remaining balance. Overdue is a computed condition, not a persisted status. |
| **Reminder candidate** | An overdue receivable presented for collection follow-up and reminder-draft selection. It is not a separate receivable type or persisted entity. |
| **AI matching recommendation** | A nullable, immutable-once-evaluated JSONB result for an ambiguous `60–89` transaction. It recommends one deterministic candidate or abstains; it never allocates money or changes transaction status. |
| **Current AI recommendation** | A recommendation whose receivable is still among the persisted candidates and remains open with positive balance. `isCurrent` is derived at read time; the stored evaluation is retained as history. |

## Receivable State Machine

```
                    ┌─────────────┐
                    │   DRAFT     │ (optional, for import)
                    └──────┬──────┘
                           │ create
                           ▼
                    ┌─────────────┐
            ┌──────│    OPEN     │──────┐
            │      └──────┬──────┘      │
            │             │             │
            │     allocate│      writeOff│
            │             ▼             ▼
            │      ┌──────────┐  ┌────────────┐
            │      │PARTIALLY │  │ WRITTEN_OFF│ (terminal)
            │      │  _PAID   │  └────────────┘
            │      └────┬─────┘
            │           │
            │   allocate│ (remaining = 0)
            │           ▼
            │    ┌──────────┐
            └───▶│   PAID   │ (closed; undo allocation may reopen)
                 └──────────┘

    CANCELLED: only from OPEN/PARTIALLY_PAID when paidAmount = 0
```

**Historical outstanding** means the sum of the latest balance snapshots at a cutoff
for receivables whose snapshot status is `OPEN` or `PARTIALLY_PAID`. It excludes
`PAID`, `CANCELLED`, and `WRITTEN_OFF`; it is not the invoice total or the amount
collected. Cutoff month boundaries are interpreted in `Asia/Ho_Chi_Minh`; stored
timestamps remain absolute instants. When transitions share an instant, a stable
append order determines which snapshot is latest.
The balance snapshot intentionally carries `remainingAmount` and `status`, not a second
historical copy of `originalAmount`. `null` historical outstanding means coverage is
unknown; `0` means coverage exists and no open balance remains. A new organization
without any balance snapshot is not yet covered and returns `null`, not zero. Dispute
changes and other non-balance field updates are not balance transitions and do not
create balance snapshots. A status-only transition still creates a snapshot because
status controls whether the balance contributes to historical outstanding. Completed
periods use balance history; the incomplete current period uses the current receivable
rollup.

**Transition provenance** is the minimal actor and reason context attached to a balance
snapshot to explain how that transition occurred. New snapshots require a `reasonCode`;
`USER` provenance requires an actor user, while `SYSTEM` and `WEBHOOK` provenance does
not. `USER` means direct human action, `WEBHOOK` means an external webhook-triggered
transition, and `SYSTEM` means an internal job or baseline. Batch actions remain `USER`.
A human-readable note is optional. Legacy snapshots may have unknown provenance. It is
not the full `AuditLog` record.

**Rollout baseline snapshot** is the first balance snapshot for each existing receivable
when balance history coverage begins. It establishes complete coverage from rollout
onward; it does not reconstruct months before rollout. The baseline is a single cutover
performed while receivable mutations are paused briefly, so no transition is interleaved
with the baseline. It includes every existing receivable, regardless of status, so
closed and draft records also establish coverage. Cutoffs before the baseline are
unknown; the baseline instant is the boundary from which historical outstanding is
complete. The baseline is idempotent per receivable and rollout, so an interrupted
baseline can be retried without duplicating snapshots. The MVP baseline is one atomic
transaction: failure rolls back the full baseline and does not establish coverage. The
current domain has one coverage epoch per organization; a later re-baseline would
require an explicit new epoch. It is a coverage event, not a receivable business
transition, so it does not emit ordinary audit, collection, or notification events.
`DRAFT` remains a declared but currently unused receivable status; its future
transition into `OPEN` must be defined explicitly when a real draft workflow exists.

## AR Ledger

The **AR Ledger** is the append-only stream of every `LedgerEvent` for an organization —
the single query surface for "how did this organization's AR money move" without joining
`Receivable`, `Payment`, and `PaymentAllocation`. It is scoped to AR only: `Receivable`,
`Payment`, and the credit balance a `Payment` retains when not fully allocated. It does
**not** cover `PeriodCharge`/`PlanUpgradeOrder` (CASSO's own subscription revenue from the
tenant) — that is a different accounting subject (CASSO is the payee there; in AR the
tenant is the payee) and out of scope for this ledger.

The AR Ledger is explicitly **not** a double-entry general ledger: there is no `Account`
entity, no chart of accounts, and no requirement that debits equal credits. A `LedgerEvent`
is a single signed movement against one subject, not a balanced pair of postings. Adopting
real double-entry accounting (accounts, balanced postings, financial-statement support) is
a deferred, unscoped idea — revisit only if a concrete requirement appears (e.g. exporting
to external accounting software); seeing "Ledger" in the product name is not by itself
such a requirement.

A `PaymentAllocation` action is two-sided: it moves money off one subject (a `Payment`'s
unallocated/credit balance) and onto another (a `Receivable`'s remaining balance). This
falls out of the domain naturally — it is not an imposed double-entry rule — so one
`allocate` or `undo` action emits **two** `LedgerEvent` rows, one per subject:

- **Receivable-subject kinds** mirror `ReceivableBalanceHistory`'s change sources:
  `RECEIVABLE_CREATED`, `RECEIVABLE_ALLOCATED`, `RECEIVABLE_ALLOCATION_UNDONE`,
  `RECEIVABLE_CANCELLED`, `RECEIVABLE_WRITTEN_OFF`, `RECEIVABLE_ROLLOUT_BASELINE`.
- **Payment-subject kinds** track the credit balance, which today has no history at all
  (only the current `unallocatedAmount` is queryable): `PAYMENT_RECEIVED` (credit opens at
  the full payment amount when the `Payment` is created), `PAYMENT_ALLOCATED` (credit
  decreases — the other side of `RECEIVABLE_ALLOCATED`), `PAYMENT_ALLOCATION_UNDONE`
  (credit is restored — the other side of `RECEIVABLE_ALLOCATION_UNDONE`),
  `PAYMENT_ROLLOUT_BASELINE`.

The AR Ledger is a **dual-write, not a replacement**: `Receivable.paidAmount`,
`Payment.allocatedAmount`, and `ReceivableBalanceHistory` are unchanged (ADR-0002,
ADR-0018 still hold) — every read path that exists today keeps reading exactly what it
reads today. `LedgerEvent` rows are written in the same transaction as the triggering
allocate/undo/cancel/write-off, so the ledger can never observe a state the rollups
didn't also reach. Like `ReceivableBalanceHistory`, existing data gets a
`*_ROLLOUT_BASELINE` opening event per subject via a one-time atomic migration, following
the same precedent as the balance-history rollout baseline — the ledger has no history
before that cutover.

**Change source** names the lifecycle transition (`CREATE`, `ALLOCATE`, `UNDO`,
`CANCEL`, `WRITE_OFF`, or `ROLLOUT_BASELINE`). **Reason code** names the business
justification for that transition; the two terms are not interchangeable. The stable
reason vocabulary is `RECEIVABLE_CREATED`, `PAYMENT_ALLOCATED`,
`PAYMENT_ALLOCATION_UNDONE`, `RECEIVABLE_CANCELLED`, `RECEIVABLE_WRITTEN_OFF`, and
`ROLLOUT_BASELINE`. `ROLLOUT_BASELINE` uses system provenance and represents the start
of history coverage, not receivable creation. **Transition reference ID** identifies a
related object such as an allocation or undo operation; it is not a reason. Balance
history records only committed transitions; failed attempts and rolled-back webhook
deliveries do not create snapshots.
Each change source has one corresponding reason code: `CREATE` →
`RECEIVABLE_CREATED`, `ALLOCATE` → `PAYMENT_ALLOCATED`, `UNDO` →
`PAYMENT_ALLOCATION_UNDONE`, `CANCEL` → `RECEIVABLE_CANCELLED`, `WRITE_OFF` →
`RECEIVABLE_WRITTEN_OFF`, and `ROLLOUT_BASELINE` → `ROLLOUT_BASELINE`.
Corrections such as an allocation undo append a new snapshot at the correction time;
they never rewrite an earlier snapshot.

## Business Rules (CRITICAL — violation is a bug)

1. **Money:** integers in VND units, do NOT freely use float/decimal
2. **Transactions:** every write that changes an amount/status MUST be inside one DB transaction
3. **Persisted rollup:** `paidAmount` and `allocatedAmount` are updated only inside a transaction with a row lock
4. **Derived fields:** `remainingAmount`, `unallocatedAmount`, `isOverdue`, `isDisputed` — calculated at query time
5. **Tenant isolation:** every query/write must be scoped by `organizationId`
6. **Allocation:** `Payment.customerId` MUST exist and match `Receivable.customerId`
7. **Undo:** soft-delete + audit; do not physically delete
8. **Terminal statuses:** WRITTEN_OFF and CANCELLED cannot transition further. PAID is closed normally, but undoing a payment allocation may transition it back to OPEN or PARTIALLY_PAID.
9. **Retention Policy:** INSERT-only, unbounded-growth tables are pruned by a daily cutoff-based delete, not query-time filtering. Windows (see issue #118): `webhook_inbox` 90d, `idempotency_keys` 90d post-COMPLETED, `ai_usage_logs` 12mo, `audit_logs`/`collection_activities`/`reminder_executions` 24mo, `alerts` 90d after `readAt` (unread rows are never auto-pruned). `ReceivableBalanceHistory` is an exception: retain it with the receivable data because it is the source for historical outstanding; archival requires an explicit policy first.
10. **Plan tiers:** FREE < STARTER < BUSINESS < ENTERPRISE (strict order). A `Subscription` may only move to a strictly higher tier via `PlanUpgradeOrder` (self-service upgrade); there is no downgrade or cancel action — an org on a paid tier must pay a `PeriodCharge` for the current billing period to keep that tier. If unpaid by the end of a 3-day grace window after period end, the `Subscription` automatically drops to FREE (not a user-triggered downgrade). During the grace window `status` stays `ACTIVE` (see ADR-0012) — `PAST_DUE` keeps its existing meaning of an immediate hard block (`plan-limit.service.ts`), it is not used for renewal grace
11. **Batch operations:** a `Batch operation` (API request with multiple items) processes each item independently — one item's failure does not roll back or block the others. Every successful per-item receivable transition has its own balance snapshot; a failed item has none. Never wrap a batch in a single all-or-nothing transaction; that is a distinct, rejected design (see ADR-0016)
12. **Organization lock (research, not yet built — issue #98):** an `Operator` locking an `Organization` (`status: LOCKED`) is a hard block — every request scoped to that organization is rejected, not a soft warning restricted to specific actions
13. **Member block (issue #178, shipped PR #182):** distinct from #12 — blocking targets one `Membership`, not the whole `Organization`. Two actors: the org's own `OWNER` (any other member, never themselves), or a cross-org `Operator` (any member of any org, including that org's `OWNER` — the one case no in-org role can act on). Applies to a pending-invite `Membership` (`joinedAt: null`) the same as a joined one — `status` doesn't care whether the invite was ever accepted. Reversible (`unblock`), unlike removing a member (`deleteByUserAndOrganization`), which is a hard delete with no undo. Enforced per-request against the persisted `status`, not by revoking the JWT — a block takes effect on the member's very next request to that org, no separate session/token invalidation needed
14. **Pending invite actions (issue #189):** a cross-org `Operator` may resend or revoke any unaccepted invitation, including one whose token has expired or whose requested role is `OWNER`. Resend atomically replaces the old invitation and records `INVITE_RESENT`; revoke atomically invalidates the invitation and records `INVITE_REVOKED`. Both actions are organization-scoped and idempotent at the request boundary. A queue-enqueue failure is reported synchronously; a later worker/provider failure remains asynchronous under ADR-0009 (see rule 15 — since issue #314 shipped (PR #323), new invitations can no longer request `OWNER`; this only describes pre-#314/historical invitations)
15. **Single-owner invariant (issue #314, shipped PR #323):** an `Organization` has exactly one active `OWNER` `Membership` at a time — a ceiling complementing the existing last-owner floor (rule 13, `assertNotLastOwner`), backstopped by a DB-level partial unique index (`memberships(organizationId) WHERE role='OWNER' AND joinedAt IS NOT NULL`). Neither `invite-member` nor `change-member-role` may assign `OWNER` (enforced by excluding `OWNER` from the role type those two endpoints accept, not a runtime check). The only way to grant `OWNER` is `OwnershipTransferRequest` (rule 16, issue #322, not yet built). Organizations that already held more than one `OWNER` before this shipped were backfilled by a migration that kept the earliest-joined `OWNER` `Membership` and demoted the rest to `FINANCE_MANAGER`
16. **Ownership transfer flow (issue #322, not yet built):** the only way to grant `OWNER` (rule 15). State machine: `PENDING_OTP_CONFIRMATION` → `PENDING_ACCEPTANCE` → `ACCEPTED` \| `DECLINED` \| `CANCELLED` \| `EXPIRED`. The current `OWNER` requests a transfer to an existing, active, non-blocked `Membership` with their password; on success a 6-digit OTP (SHA-256 hash, 5-minute TTL) is emailed, reusing `ChangePasswordRequestUseCase`'s exact mechanism. Confirming the OTP moves the request to `PENDING_ACCEPTANCE` with a 48-hour window and emails the target a plain notification — deliberately not a secret accept link: unlike `MembershipInvite` (pre-auth, where the token is the only credential), the target already has an account, so acceptance requires being authenticated as that exact `userId` instead (ADR-0025). Accepting re-validates every precondition at that moment (target still active/unblocked, requester still `OWNER`) rather than trusting request-time state, then atomically promotes the target and demotes the prior `OWNER` to `FINANCE_MANAGER`. The target may explicitly decline; the requesting `OWNER` may cancel at any point before acceptance. Only one non-terminal request may exist per `Organization` at a time. Both TTLs are enforced by lazy reclaim at the next access (create/view/accept/decline), not a cron — the same pattern as `IdempotencyKey`'s stale-`PENDING` reclaim (ADR-0015)
17. **Deferred signup provisioning (issue #336, shipped PR #338):** `Organization`/`User`/`Membership`/`Subscription`/bootstrap data are created only on successful email OTP verification, never at signup submission — closes the gap where an unverified signup attempt left permanent, `PENDING_REVIEW` organization records that an operator still had to triage. Signup writes only a `PendingSignup` row (rule content above); verification atomically runs the same provisioning transaction `SignupUseCase` ran before #336, then deletes the row, and logs the new user in exactly as verification does today. Duplicate-email and duplicate-tax-code checks apply identically whether the conflict is with an already-provisioned `Organization`/`User` or a still-pending `PendingSignup` (ADR-0026)
18. **Signup abuse hardening (issue #337, not yet built):** possessing a tax code (public VietQR reference data) or a matching name is never itself authority over an organization — rule 17's `PENDING_REVIEW` gate is necessary but not sufficient. `ApproveOrganizationUseCase` additionally requires an `OrganizationVerificationMethod` (rule content above) on every `ORGANIZATION_APPROVED` `OperatorAuditLog` row; `RejectOrganizationUseCase` is unaffected (rejecting confirms nothing, so it keeps only `reason`). Tax-code lookup and signup are rate-limited independently along three dimensions (IP, email, tax code) via named per-dimension throttlers, not one shared composite key — a request is blocked if it exceeds *any* dimension's budget, so rotating one dimension (e.g. email) doesn't bypass a limit tripped on another (e.g. IP). Repeated throttled (429) responses from the same IP escalate that IP to a stricter, longer cooldown across every signup/lookup route — the "equivalent risk control" this codebase chose over a third-party CAPTCHA (ADR-0027) — until the escalation window lapses. Signup, verification, and resend emit structured `info` logs (email/tax code/`requestId`, no OTP/password) instead of a new persisted audit table, since `PendingSignup` predates any `Organization` and tenant `AuditLog` requires a non-null `organizationId` (ADR-0027) — the same reasoning that keeps `OperatorAuditLog` separate from tenant `AuditLog` (see its entry above)

## RBAC

5 roles: `OWNER` > `FINANCE_MANAGER` > `ACCOUNTANT` > `SALES_REP` > `VIEWER`

| Permission | OWNER | FINANCE_MGR | ACCOUNTANT | SALES_REP | VIEWER |
|-----------|-------|-------------|------------|-----------|--------|
| RECEIVABLE_READ | ✓ | ✓ | ✓ | ✓ (own) | ✓ |
| RECEIVABLE_AUDIT_READ | ✓ | ✓ | — | — | ✓ |
| AUDIT_LOG_READ | ✓ | ✓ | — | — | ✓ |
| RECEIVABLE_WRITE | ✓ | ✓ | ✓ | — | — |
| RECEIVABLE_WRITE_OFF | ✓ | ✓ | — | — | — |
| PAYMENT_ALLOCATE | ✓ | ✓ | ✓ | — | — |
| PAYMENT_ALLOCATE_UNDO | ✓ | ✓ | — | — | — |
| BANK_CONNECTION_MANAGE | ✓ | — | — | — | — |
| SUBSCRIPTION_MANAGE | ✓ | ✓ | — | — | — |
| USER_MANAGE | ✓ | ✓ | — | — | — |

**SALES_REP:** can only view receivables assigned to them — `Receivable.salesRepresentativeId = ctx.userId`. A receivable with a null `salesRepresentativeId` (unassigned) is visible to no `SALES_REP`. The rule holds on every `RECEIVABLE_READ` path, list and single-receivable detail alike.

## API Conventions

- **Prefix:** `/api/v1` for all business APIs
- **Error:** `{ statusCode, errorCode, message, details? }`
- **Idempotency:** `Idempotency-Key` header for POST requests that create or change money/status
- **Health:** `GET /health`, `GET /metrics` (Prometheus)
- **Timezone:** `Asia/Ho_Chi_Minh` for reminder cron/today

## Matching Engine (Webhook → Payment)

```
Score ≥ 90:  Auto payment allocation
Score 60-89: Exception Queue (human review)
Score < 60:  UNMATCHED

Score components:
  referenceCodeScore (0-60) + amountScore (0-20) + customerBankAccountScore (0-10)
  + payerNameScore (0-5) + timingScore (0-5)
```

## Batch Operations

`Batch operation` (backend) vs `Bulk selection`/`Bulk action bar` (frontend): a batch operation is one API request carrying multiple items (e.g. `POST /bank-transactions/batch-skip`), each processed independently with a per-item result (see Business Rule 11). A bulk action bar is the UI surface a user drives to trigger one.

- Batch size: max 50 items per request
- Every batch item's transaction/tenant scoping and permission checks are identical to the single-item endpoint it reuses — a batch endpoint is never a separate authorization path
- **Bulk approve match:** an Exception Queue row is eligible for one-click bulk approval only when its `topCandidate.totalScore ≥ 80` (`BULK_APPROVE_THRESHOLD`) — distinct from and lower than `AUTO_MATCH_THRESHOLD` (90, webhook auto-match), because every Exception Queue row is by definition already below 90. The full bank transaction amount is submitted as the allocation; if it exceeds the receivable's `remainingAmount` the item fails with `ALLOCATION_EXCEEDS_REMAINING` in its per-item result rather than blocking the rest of the batch.

## Architecture Decisions (ADR)

| ADR | Decision | Rationale |
|-----|----------|-----------|
| 0001 | Shared-schema multi-tenancy | `organizationId` on every table, no RLS in MVP |
| 0002 | Persisted rollup | No runtime `SUM(PaymentAllocation)` |
| 0003 | isDisputed computed | `EXISTS(SELECT 1 FROM disputes WHERE status='OPEN')` |
| 0004 | Reminder scan/send split | Cron enqueues, worker re-checks before sending |
| 0005 | Distinct events per closure audience | `receivable.status-closed` (any terminal status) is separate from `receivable.closed` (PAID-only); don't widen one event to serve two contracts |
| 0006 | BYO-SMTP for org-branded reminder emails | Org supplies own SMTP server (Supabase-style) instead of Resend domain-verification/DNS; sync test-send, reactive failure detection, fallback to Resend — BUSINESS+ only |
| 0010 | Billing gates on persisted Subscription | Advisory-locked checks in-transaction, lazy calendar-month periods |
| 0011 | Plan changes are upgrade-only | No downgrade/cancel action; non-renewal is the only path back to FREE |
| 0012 | PeriodCharge + renewal-reminder cron | PayOS has no auto-charge, so renewal is a self-serve repeat payment; a reminder cron is needed since ADR-0010's "no cron" premise assumed no recurring payment obligation existed |
| 0013 | Alert module separate from `notifications` (email queue) | New `alerts/` module owns the in-app, read/unread concept; `notifications/` keeps meaning "email queue" only — avoids overloading "Notification" |
| 0014 | Alert SSE via in-process EventEmitter2, no cross-instance relay | Single-instance `backend` today; breaks silently if horizontally scaled — a future replica needs a Redis-relay upgrade before the bell stays live |
| 0015 | Idempotency-Key PENDING rows reclaimed as stale after 5 minutes | Prevents permanent PENDING leak on process crash (issue #118), trading strict idempotency for a rare >5min-running request against bounded leak otherwise |
| 0016 | Batch endpoints process items independently, never as one all-or-nothing transaction | Issue #134 requires per-item failure reporting; an all-or-nothing transaction would also hold row locks across up to 50 items, violating the short-transaction-scope rule |
| 0017 | Cross-org Operator plane is separate from tenant RBAC (proposed) | `Operator` is a flag on `User` with its own `AdminGuard`/`OperatorAuditLog`, never touching `TenantContextService`/`PermissionGuard`/`AuditLog` — those are the cross-cutting foundation every business module depends on; research for issue #98, not yet built |
| 0019 | Member block scoped to `Membership`, not `User` | Blocking must not leak across orgs a `User` belongs to; `OWNER` action gets its own `MEMBER_BLOCK` permission instead of riding `USER_MANAGE`; issue #178, shipped PR #182 |
| 0020 | AR Ledger is event-sourced, not double-entry (proposed) | Additive `LedgerEvent` stream covering `Receivable` + `Payment` credit movements, dual-write alongside existing rollups/`ReceivableBalanceHistory`; no `Account`/chart-of-accounts/debit=credit — issue #264 |
| 0024 | Organization has exactly one OWNER, single-owner strict | Caps `OWNER` at one via role-type exclusion on invite/change-role instead of a "primary owner" flag alongside multi-owner; only `OwnershipTransferRequest` (password+OTP + target accept) can move it — issue #314, shipped PR #323 |
| 0025 | Ownership-transfer acceptance has no secret token, JWT-auth-only (proposed) | Target is an existing account, not a pre-auth invitee like `MembershipInvite` — authenticated `userId` match is already sufficient, so a magic-link token would add a redundant credential; issue #322 |
| 0026 | Defer signup provisioning to email verification via `PendingSignup`, lazy-reclaim TTL (shipped PR #338) | Closes false-`PENDING_REVIEW` triage load from unverified signups (issue #331/#336); reuses `OwnershipTransferRequest`/`IdempotencyKey`'s lazy-reclaim pattern (ADR-0015) instead of adding a cron, even though `PendingSignup` carries a password hash, because the TTL window is short (10 min) |
| 0027 | Signup abuse hardening: per-dimension rate-limit escalation instead of CAPTCHA; structured logging instead of a new pre-tenant audit table (proposed) | Issue #337's AC explicitly allows an "equivalent risk control", not just a CAPTCHA — escalating throttling needs no third-party dependency, frontend widget, or secret key; signup/verify events have no `organizationId` yet, and tenant `AuditLog` requires one non-null, so a persisted pre-tenant audit table would be a third audit-table pattern (after `AuditLog` and `OperatorAuditLog`) built before any consumer needs to query it |

## Constraints

- Amounts: integers in VND units
- `domain/` does not import NestJS/TypeORM
- `synchronize: true` in MVP, migration-based when needed
- Frontend not yet scaffolded (Plan #18-21)
- Auth not yet implemented (Plan #4)
- Multi-tenancy not yet implemented (Plan #2)
