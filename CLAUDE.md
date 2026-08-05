@AGENTS.md

# Casso Ledger

A B2B SaaS platform for automating accounts receivable management and collection for Vietnamese businesses. The product directly connects to real-time bank transaction data through Cas ID/CASSO Balance Hook.

## Quick Reference

- **Repo:** `lengocanh2005it/casso-ledger`
- **Detailed docs:** `docs/overview.md` (overview), `docs/superpowers/` (spec/plan), `docs/adr/` (architecture decisions)
- **Feature map:** `docs/wayfinder/feature-map.md`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm 11 workspaces + Turborepo |
| Backend | NestJS 11, TypeORM 1.1, PostgreSQL 16 |
| Frontend | React 19 + Vite 8 + Tailwind v4 + shadcn/ui |
| Queue | BullMQ + Redis |
| Email | Resend |
| Tooling | Biome 2 (lint/format), Husky + lint-staged |
| Testing | Jest 30 + testcontainers + supertest |
| TypeScript | 6.0 |
| Deploy | Docker Compose (4 services) |

## Project Structure

```
casso-ledger/
  apps/
    backend/          NestJS modular monolith
      src/
        common/       Shared: tenancy, audit, auth, RBAC
        modules/      Domain modules (Clean Architecture 4 layers)
          customers/
          invoices/
          receivables/
          payments/
          ...         (webhooks, reminders, emails, etc.)
    frontend/         React 19 + Vite (planned)
  packages/
    shared-types/     Enum/status, Permission/ROLE_PERMISSIONS (BE/FE)
  docs/
    adr/              Architecture Decision Records
    superpowers/      Plan/spec files for each feature
    agents/           Agent configuration
```

## Clean Architecture (Backend Modules)

Each business module follows 4 layers:

```
domain/           Entity, state machine, domain error — NO NestJS/TypeORM imports
application/      Use case + port interface (I<Entity>Repository)
infrastructure/   TypeORM repository, adapters (Resend, Cas ID)
presentation/     Controller, DTO, DI wiring
```

Dependency: `presentation → application → domain`, `infrastructure → application`.

## Core Domain Concepts

| Concept | Description |
|---------|------------|
| **Receivable** | Amount receivable. Status: OPEN → PARTIALLY_PAID → PAID / WRITTEN_OFF / CANCELLED |
| **Payment** | Payment from a bank transaction. `allocatedAmount` is a rollup |
| **PaymentAllocation** | Payment → receivable allocation. Historical source of truth. Soft-delete on undo |
| **Customer** | Customer belonging to an organization |
| **Invoice** | Invoice, the source that creates a receivable |
| **Organization** | Tenant boundary for multi-tenancy |

## Business Rules (CRITICAL)

- **Money:** integers in VND units, do NOT use float
- **Transactions:** every write that changes an amount/status MUST be inside one DB transaction
- **Persisted rollup:** `paidAmount` (Receivable) and `allocatedAmount` (Payment) are updated only inside a transaction with a lock
- **Derived fields:** `remainingAmount`, `unallocatedAmount`, `isOverdue`, `isDisputed` — calculated at query time
- **Tenant isolation:** every query/write must be scoped by `organizationId`
- **API prefix:** all business APIs use the `/api/v1` prefix
- **Error shape:** `{ statusCode, errorCode, message, details? }`
- **Timezone:** `Asia/Ho_Chi_Minh` for reminder cron/today

## Key Decisions (from ADRs)

1. **Shared-schema multi-tenancy** — `organizationId` on every table, no RLS in MVP (ADR-0001)
2. **Persisted rollup** — no runtime `SUM(PaymentAllocation)` (ADR-0002)
3. **isDisputed is a computed field** — `EXISTS(SELECT 1 FROM disputes WHERE status='OPEN')` (ADR-0003)
4. **Reminder scan/send split** — cron enqueues, worker re-checks before sending (ADR-0004)

## RBAC (5 roles)

`OWNER` > `FINANCE_MANAGER` > `ACCOUNTANT` > `SALES_REP` > `VIEWER`

Permission check: backend `@RequirePermission()` decorator + `PermissionGuard`.  
FE: `hasPermission(role, permission)` from `shared-types`, **hide the button when permission is missing**.

## Coding Conventions

- **File:** kebab-case (`create-receivable.usecase.ts`)
- **Class:** PascalCase
- **Variable/function:** camelCase
- **Enum:** UPPER_SNAKE_CASE (e.g., `PARTIALLY_PAID`)
- **Imports:** `node:` protocol for Node.js builtins (e.g., `node:crypto`); `import type` for pure types, value imports (never `import type`) for classes used in constructor params/decorators — NestJS DI/ValidationPipe resolve them via `emitDecoratorMetadata`
- **Biome:** single quotes, semicolons always, 2-space indent
- **Test:** `*.spec.ts` for unit tests, `*.e2e-spec.ts` for integration tests
- **TDD:** new behavior, bug fixes, and refactors follow RED → GREEN → REFACTOR; observe a relevant failing test before production code
- **Verification:** before claiming completion or creating a PR, use `verification-before-completion` and report fresh command evidence

## Implementation Order

```
Lane A (1-6):   Scaffolding → Domain Core → Multi-tenancy → Auth → Billing → Email templates
Lane B (7-16):  Email service → Webhook → Dispute → Timeline → Tasks → Reminder → Exception → Import → Aging → Copilot
Lane C (17-21): Read APIs → FE Design → FE Auth → FE Core → FE Features
Lane D (22-23): Testing/CI → Deployment
```

## Available Commands

```bash
pnpm install              # Install all deps
pnpm dev:backend          # Start backend in watch mode
pnpm test                 # Run all unit tests
pnpm --filter @casso-ledger/backend test:e2e   # Run e2e tests (needs Docker)
pnpm lint                 # Lint all packages
pnpm format               # Format with Biome
pnpm verify               # lint + type-check + test
```

## Agent skills

### Issue tracker

GitHub Issues via `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.

### Skill routing

- Bug or unexpected behavior → `systematic-debugging` → TDD
- Multi-file feature → `brainstorming` → `writing-plans` → TDD
- New domain/business rule → `domain-modeling`
- Frontend UI → `frontend-design`
- External or unstable technical information → `research`
- Review/PR → `code-review` → `requesting-code-review` → `verification-before-completion`
- Review feedback → `receiving-code-review`
- GitHub Actions failure → `github:gh-fix-ci`
