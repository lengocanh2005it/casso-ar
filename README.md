# Casso Ledger

Nền tảng B2B SaaS tự động hóa quản lý & thu hồi công nợ doanh nghiệp, dựa trên dữ liệu giao dịch ngân hàng thời gian thực (Cas ID + CASSO Balance Hook): tự đối soát giao dịch với hóa đơn, tự nhắc khách theo lịch, tự đóng công nợ khi nhận đủ tiền.

## Trạng thái

✅ **Plan #1 hoàn thành** — Monorepo scaffold + Domain Core (Customer, Invoice, Receivable, Payment, PaymentAllocation)

📦 Tech stack: NestJS 11 · TypeORM 1.1 · PostgreSQL 16 · React 19 · Vite 8 · TypeScript 6.0 · Biome 2.5

## Quick Start

```bash
# Install dependencies
pnpm install

# Start backend (requires Docker for Postgres + Redis)
docker compose up -d postgres redis
pnpm dev:backend

# Run tests
pnpm test
```

## Kiến trúc

```
casso-ledger/
  apps/
    backend/       NestJS 11, Clean Architecture 4 layers
    frontend/      React 19 + Vite (planned)
  packages/
    shared-types/  Enum/status dùng chung BE/FE
```

Chi tiết: [docs/overview.md](docs/overview.md)

## Tài liệu

| Nội dung | Đường dẫn |
|---|---|
| Tổng quan sản phẩm, module, business rules | [docs/overview.md](docs/overview.md) |
| Feature map (implementation tracking) | [docs/wayfinder/feature-map.md](docs/wayfinder/feature-map.md) |
| Spec chi tiết từng module | [docs/superpowers/specs/](docs/superpowers/specs/) |
| Kế hoạch triển khai | [docs/superpowers/plans/](docs/superpowers/plans/) |
| Architecture Decision Records | [docs/adr/](docs/adr/) |
| Agent instructions | [CLAUDE.md](CLAUDE.md) |
| Coding rules cho mọi agent | [AGENTS.md](AGENTS.md) |

## Available Commands

```bash
pnpm install              # Install all deps
pnpm dev:backend          # Start backend in watch mode
pnpm test                 # Run all unit tests
pnpm lint                 # Lint all packages
pnpm format               # Format with Biome
```

## License

Private / nội bộ CASSO — chưa xác định license công khai.
