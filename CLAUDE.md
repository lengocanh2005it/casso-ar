@AGENTS.md

# Casso Ledger

Nền tảng tự động hóa quản lý và thu hồi công nợ phải thu (Accounts Receivable) cho doanh nghiệp Việt Nam. Sản phẩm B2B SaaS kết nối trực tiếp dữ liệu giao dịch ngân hàng thời gian thực qua Cas ID/CASSO Balance Hook.

## Quick Reference

- **Repo:** `lengocanh2005it/casso-ledger`
- **Docs chi tiết:** `docs/overview.md` (tổng quan), `docs/superpowers/` (spec/plan), `docs/adr/` (quyết định kiến trúc)
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
| **Receivable** | Khoản phải thu. Status: OPEN → PARTIALLY_PAID → PAID / WRITTEN_OFF / CANCELLED |
| **Payment** | Thanh toán từ giao dịch ngân hàng. `allocatedAmount` là rollup |
| **PaymentAllocation** | Phân bổ payment → receivable. Source of truth lịch sử. Soft-delete khi undo |
| **Customer** | Khách hàng, thuộc organization |
| **Invoice** | Hóa đơn, nguồn tạo receivable |
| **Organization** | Tenant boundary cho multi-tenancy |

## Business Rules (CRITICAL)

- **Money:** integer đơn vị đồng, KHÔNG dùng float
- **Transactions:** mọi write thay đổi số tiền/status PHẢI trong 1 DB transaction
- **Persisted rollup:** `paidAmount` (Receivable) và `allocatedAmount` (Payment) chỉ cập nhật trong transaction có lock
- **Derived fields:** `remainingAmount`, `unallocatedAmount`, `isOverdue`, `isDisputed` — tính tại query time
- **Tenant isolation:** mọi query/write phải scope theo `organizationId`
- **API prefix:** tất cả business API dùng `/api/v1` prefix
- **Error shape:** `{ statusCode, errorCode, message, details? }`
- **Timezone:** `Asia/Ho_Chi_Minh` cho reminder cron/today

## Key Decisions (from ADRs)

1. **Shared-schema multi-tenancy** — `organizationId` trên mọi bảng, không RLS ở MVP (ADR-0001)
2. **Persisted rollup** — không `SUM(PaymentAllocation)` runtime (ADR-0002)
3. **isDisputed là computed field** — `EXISTS(SELECT 1 FROM disputes WHERE status='OPEN')` (ADR-0003)
4. **Reminder scan/send split** — cron enqueue, worker re-check trước khi gửi (ADR-0004)

## RBAC (5 roles)

`OWNER` > `FINANCE_MANAGER` > `ACCOUNTANT` > `SALES_REP` > `VIEWER`

Permission check: backend `@RequirePermission()` decorator + `PermissionGuard`.  
FE: `hasPermission(role, permission)` từ `shared-types`, **ẩn button khi thiếu quyền**.

## Coding Conventions

- **File:** kebab-case (`create-receivable.usecase.ts`)
- **Class:** PascalCase
- **Variable/function:** camelCase
- **Enum:** UPPER_SNAKE_CASE (e.g., `PARTIALLY_PAID`)
- **Imports:** `node:` protocol cho Node.js builtins (e.g., `node:crypto`)
- **Biome:** single quotes, semicolons always, 2-space indent
- **Test:** `*.spec.ts` cho unit, `*.e2e-spec.ts` cho integration

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
