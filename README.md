# Casso Ledger

Nền tảng B2B SaaS tự động hóa quản lý & thu hồi công nợ doanh nghiệp, dựa trên dữ liệu giao dịch ngân hàng thời gian thực (Cas ID + CASSO Balance Hook).

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
casso-ledger/
  apps/
    backend/          NestJS 11, Clean Architecture 4 layers
    frontend/         React 19 + Vite + Tailwind v4
  packages/
    shared-types/     Enum/status dùng chung BE/FE
```

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

Private / nội bộ CASSO.
