# Wayfinder Map — Casso Ledger AR Automation

**Tracker**: GitHub Issues
**Charted**: 2026-08-04
**Charter session**: setup-matt-pocock-skills + project-scaffolding plan
**Map mode**: chart — Plan #1 complete, Plan #2+ pending

---

## Destination

A priority-ordered backlog of every feature Lane A–D must ship to land the full AR Automation platform. Each ticket sized to one implementation session. Map is "done" when no ticket remains open and every shipped feature is reflected here.

Success = a single document a new developer can read and know exactly what to pick up next, what blocks it, and which spec it implements.

## Notes

**Source-of-truth synthesis:**
- `docs/superpowers/IMPLEMENTATION-ORDER.md` — implementation order + dependencies
- `docs/superpowers/plans/` — detailed implementation plans
- `docs/superpowers/specs/` — design specs
- `docs/adr/` — Architecture Decision Records

**Standing preferences:**
- Read this map once per session before picking a ticket
- Cite ADRs from `docs/adr/` for any architectural decision
- Cite specs from `docs/superpowers/specs/` for any feature work
- Owner: `BE` (backend NestJS) or `FE` (frontend React)
- Type labels: `task`, `research`, `prototype`, `grilling`
- Status: `open` | `in-progress` | `blocked` | `done` | `superseded`
- Blockers list plans that must complete first

**Business rules (enforce on every ticket):**
1. Money: integer đồng, KHÔNG float
2. Transactions: write money/status trong 1 DB transaction
3. Tenant isolation: mọi query/write scope theo organizationId
4. Derived fields: tính tại query time, KHÔNG store

## Decisions so far

- **2026-08-04**: Plan #1 (Project Scaffolding + Domain Core) complete — merged PR #1
- **2026-08-04**: Tech stack upgraded to NestJS 11, TypeORM 1.1, TypeScript 6.0, Biome 2.5
- **2026-08-04**: TenantContextService uses AsyncLocalStorage (request-scoped)
- **2026-08-04**: Domain entities: Customer/Invoice as interfaces, Receivable/Payment as classes with behavior

## Not yet specified

<!-- Fog of war — questions suspected but not sharp enough to ticket -->

- Frontend tech stack final decision (React 19 + Vite + Tailwind v4 + shadcn/ui)
- Cas ID integration details (OAuth flow, token exchange)
- Email service provider selection (Resend confirmed in spec)
- Copilot AI model selection

## Out of scope

- Microservices architecture (modular monolith for MVP)
- Kubernetes production-grade deployment
- Multi-currency support
- SSO/OAuth social login

---

## Ticket Index

**23 plans** | status snapshot (2026-08-04):
- 🟢 done (1): Plan #1
- 🔴 open/not started (22): Plan #2–#23

### Lane A — Foundation (Plans 1–6)

#### Plan #1 — Project Scaffolding + Domain Core
- **Type**: task
- **Status**: done ✅
- **Owner**: BE
- **Spec**: `docs/superpowers/specs/2026-08-03-project-scaffolding-architecture-design.md`
- **Plan**: `docs/superpowers/plans/2026-08-03-project-scaffolding-and-domain-core.md`
- **Blockers**: none
- **Shipped**: 2026-08-04 — PR #1 merged, 21 commits

#### Plan #2 — Multi-tenancy + RBAC
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `docs/superpowers/specs/2026-08-03-multi-tenancy-rbac-design.md`
- **Blockers**: Plan #1 ✅
- **Note**: Organization, User, Membership, Role, Permission entities + guards

#### Plan #3 — Billing + Usage Metering
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `docs/superpowers/specs/2026-08-03-billing-usage-metering-design.md`
- **Blockers**: Plan #1 ✅, Plan #2

#### Plan #4 — Authentication + Onboarding
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `docs/superpowers/specs/2026-08-03-authentication-onboarding-design.md`
- **Blockers**: Plan #1 ✅, Plan #2, Plan #3
- **Note**: JWT, verify email, invite, reset password, bootstrap port

#### Plan #5 — Cas ID Bank Connection
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `docs/superpowers/specs/2026-08-03-cas-id-bank-connection-design.md`
- **Blockers**: Plan #2, Plan #3, Plan #4

#### Plan #6 — Email Template Management
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `docs/superpowers/specs/2026-08-03-email-template-management-design.md`
- **Blockers**: Plan #2, Plan #3, Plan #4

### Lane B — Features (Plans 7–16)

#### Plan #7 — Email Notification Service
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `docs/superpowers/specs/2026-08-03-email-notification-service-design.md`
- **Blockers**: Plan #4, Plan #6

#### Plan #8 — Webhook Ingestion + Matching Engine
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `docs/superpowers/specs/2026-08-03-webhook-matching-engine-design.md`
- **Blockers**: Plan #1 ✅, Plan #2, Plan #5

#### Plan #9 — Dispute Management
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `docs/superpowers/specs/2026-08-03-dispute-management-design.md`
- **Blockers**: Plan #1 ✅, Plan #2

#### Plan #10 — Collection Activity Timeline
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `docs/superpowers/specs/2026-08-03-collection-activity-timeline-design.md`
- **Blockers**: Plan #1 ✅, Plan #7, Plan #9

#### Plan #11 — Internal Task + Escalation
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `docs/superpowers/specs/2026-08-03-internal-task-escalation-design.md`
- **Blockers**: Plan #1 ✅, Plan #2

#### Plan #12 — Reminder Automation
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `docs/superpowers/specs/2026-08-03-reminder-automation-design.md`
- **Blockers**: Plan #1 ✅, Plan #2, Plan #6, Plan #7

#### Plan #13 — Exception Queue + Audit Log
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `docs/superpowers/specs/2026-08-03-exception-queue-audit-log-design.md`
- **Blockers**: Plan #1 ✅, Plan #2, Plan #8

#### Plan #14 — Invoice Import
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `docs/superpowers/specs/2026-08-03-invoice-import-design.md`
- **Blockers**: Plan #1 ✅, Plan #2, Plan #3

#### Plan #15 — Aging Dashboard + Reporting
- **Type**: task
- **Status**: open
- **Owner**: BE + FE
- **Spec**: `docs/superpowers/specs/2026-08-03-aging-dashboard-reporting-design.md`
- **Blockers**: Plan #1 ✅, Plan #2, Plan #8, Plan #13

#### Plan #16 — Collection Copilot
- **Type**: task
- **Status**: open
- **Owner**: BE + FE
- **Spec**: `docs/superpowers/specs/2026-08-03-collection-copilot-design.md`
- **Blockers**: Plan #2, Plan #6, Plan #7, Plan #10, Plan #12

### Lane C — Frontend (Plans 17–21)

#### Plan #17 — Read APIs Completion
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `docs/superpowers/plans/2026-08-03-read-apis-completion.md`
- **Blockers**: Plan #1 ✅, Plan #2, Plan #3, Plan #5, Plan #8, Plan #9, Plan #10, Plan #13

#### Plan #18 — Frontend Design System
- **Type**: task
- **Status**: open
- **Owner**: FE
- **Spec**: `docs/superpowers/specs/2026-08-03-frontend-design-system.md`
- **Blockers**: Plan #1 ✅

#### Plan #19 — FE Auth + App Shell
- **Type**: task
- **Status**: open
- **Owner**: FE
- **Blockers**: Plan #3, Plan #18

#### Plan #20 — FE Core AR Loop
- **Type**: task
- **Status**: open
- **Owner**: FE
- **Blockers**: Plan #1 ✅, Plan #2, Plan #8, Plan #9, Plan #10, Plan #11, Plan #13, Plan #14, Plan #17, Plan #18, Plan #19

#### Plan #21 — FE Reminders, Copilot, Reports, Settings
- **Type**: task
- **Status**: open
- **Owner**: FE
- **Blockers**: Plan #4, Plan #5, Plan #6, Plan #7, Plan #12, Plan #15, Plan #16, Plan #17, Plan #18, Plan #19

### Lane D — Infrastructure (Plans 22–23)

#### Plan #22 — Testing Strategy + CI
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `docs/superpowers/specs/2026-08-03-testing-strategy-design.md`
- **Blockers**: Plan #1 ✅, Plan #7, Plan #8, Plan #13

#### Plan #23 — Deployment + Observability
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `docs/superpowers/specs/2026-08-03-deployment-observability-design.md`
- **Blockers**: Plan #1 ✅, Plan #7, Plan #18

---

## Frontier

**Next available tickets** (all blockers resolved):
- **Plan #2** (Multi-tenancy + RBAC) — blockers: Plan #1 ✅
- **Plan #18** (Frontend Design System) — blockers: Plan #1 ✅

**Blocked tickets waiting:**
- Plan #3–#17, #19–#23 — waiting on Plan #2 or other dependencies
