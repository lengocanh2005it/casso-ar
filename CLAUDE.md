# Casso Ledger

Hệ thống quản lý nợ phải thu (Accounts Receivable) cho doanh nghiệp Việt Nam.

## Tech Stack

- **Monorepo:** pnpm workspaces + Turborepo
- **Backend:** NestJS 10, TypeORM 0.3, PostgreSQL 16
- **Frontend:** React 19 + Vite (chưa scaffold)
- **Tooling:** Biome (lint/format), Husky + lint-staged
- **Testing:** Jest + testcontainers + supertest

## Project Structure

```
casso-ledger/
  apps/
    backend/       — NestJS modular monolith (Clean Architecture)
    frontend/      — React 19 + Vite (planned)
  packages/
    shared-types/  — enum/status dùng chung BE/FE
  docs/
    adr/           — Architecture Decision Records
    superpowers/   — Plan/spec files
```

## Agent skills

### Issue tracker

GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.
