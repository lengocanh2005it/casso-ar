# Casso AR

A B2B SaaS platform for automating business receivables management and collection, based on real-time bank transaction data (Casso Flow + CASSO Balance Hook).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm 11 + Turborepo |
| Backend | NestJS 11, TypeORM 1.1, PostgreSQL 16 |
| Frontend | React 19, Vite 6, Tailwind v4, shadcn/ui |
| Queue | BullMQ + Redis |
| Email | Resend |
| Tooling | Biome 2, Husky + lint-staged |
| Testing | Jest 30 + Vitest 3.2 + testcontainers |
| TypeScript | 6.0 |

## Quick Start

```bash
# Install dependencies
pnpm install

# Start backend (requires Docker for Postgres + Redis)
docker compose up -d postgres redis
pnpm dev:backend

# Start frontend
pnpm dev:frontend

# Run tests
pnpm test
```

## Project Structure

```
casso-ar/
  apps/
    backend/          NestJS 11, Clean Architecture 4 layers
    frontend/         React 19 + Vite + Tailwind v4
  packages/
    shared-types/     Shared BE/FE enums/statuses
```

## Architecture

Each backend module follows Clean Architecture in 4 layers, dependency flowing one direction only:

```
presentation/     Controller, DTO, DI wiring
      ↓
application/      Use case + repository port (interface)
      ↓
domain/           Entity, state machine, domain error — no NestJS/TypeORM imports
      ↑
infrastructure/   TypeORM repository, external adapters (Resend, Casso Flow) — implements the port
```

`domain/` has zero framework dependencies; `application/` depends only on ports it defines, never on `infrastructure/`'s concrete classes — external SDKs and TypeORM live behind an adapter/repository implementation, injected at the module boundary.

**Core domain flow** (see [docs/overview.md](docs/overview.md) for the full picture):

```
Invoice/Receivable created
        ↓
Casso Flow bank connection (business links their bank on flow.casso.vn; this product reads the linked account via OAuth2 and registers the webhook) → CASSO Balance Hook webhook
        ↓
WebhookInbox (idempotent) → Normalizer → Matching Engine
        ↓
Auto-allocate (score ≥ 90) / Exception Queue (60–89) / Unmatched (< 60)
        ↓
Payment ⇄ Receivable allocation → persisted rollup update (paidAmount/allocatedAmount)
        ↓
AR Ledger event appended (dual-write) + Receivable closes when fully paid
```

**Multi-tenancy:** shared-schema, `organizationId` on every table, enforced by `TenantContextService` — the only runtime source of the current org (ADR-0001).

**Key modules:** `receivables`, `payments`, `invoices`, `customers` (AR core) · `webhooks`, `bank-connections` (Casso Flow ingestion + matching) · `receivable-balance-history`, `ledger` (immutable financial history — snapshot log vs. event log, see ADR-0018/ADR-0020) · `reminders`, `email-templates`, `notifications` (collection automation) · `billing`, `payos` (subscription/plan) · `copilot` (AI collection assistant) · `disputes`, `exception-queue`, `collection-activity`, `internal-tasks` (exception handling & audit trail).

Full module map, entities, and business rules: [CONTEXT.md](CONTEXT.md). Architecture decisions with rationale: [docs/adr/](docs/adr/) — see [ADR-0021](docs/adr/0021-casso-flow-not-cas-id-for-bank-integration.md) for why Casso Flow (flow.casso.vn), not Cas ID, is the bank-transaction-data provider.

## Documentation

| Document | Path |
|----------|------|
| Product overview | [docs/overview.md](docs/overview.md) |
| Feature map | [docs/wayfinder/feature-map.md](docs/wayfinder/feature-map.md) |
| Module specs | [docs/superpowers/specs/](docs/superpowers/specs/) |
| Implementation plans | [docs/superpowers/plans/](docs/superpowers/plans/) |
| Architecture decisions | [docs/adr/](docs/adr/) |
| Agent instructions | [CLAUDE.md](CLAUDE.md) |
| Coding rules | [AGENTS.md](AGENTS.md) |

## Commands

```bash
pnpm install              # Install all deps
pnpm dev:backend          # Start backend in watch mode
pnpm dev:frontend         # Start frontend in watch mode
pnpm test                 # Run all tests
pnpm lint                 # Lint all packages
pnpm format               # Format with Biome
pnpm verify               # lint + type-check + test
```

## License

Private / internal to CASSO.
