# CASSO Accounts Receivable Automation

Nền tảng B2B SaaS tự động hóa quản lý & thu hồi công nợ doanh nghiệp, dựa trên dữ liệu giao dịch ngân hàng thời gian thực (Cas ID + CASSO Balance Hook): tự đối soát giao dịch với hóa đơn, tự nhắc khách theo lịch, tự đóng công nợ khi nhận đủ tiền.

> **Trạng thái:** Giai đoạn spec/planning — kiến trúc, domain model và toàn bộ quyết định thiết kế đã chốt trong [`docs/superpowers/`](docs/superpowers/), **code chưa được scaffold**. Xem [OVERVIEW.md](OVERVIEW.md) để hiểu đầy đủ nghiệp vụ, module và kiến trúc.

## Bài toán

Kế toán hiện phải tự đăng nhập từng tài khoản ngân hàng, đọc nội dung chuyển khoản, ghép thủ công với hóa đơn, rồi nhắc từng khách — dễ nhắc nhầm khách đã trả, khó dự báo dòng tiền. Nền tảng này tự động hóa toàn bộ vòng lặp đó bằng cách gắn trực tiếp vào dòng tiền thực qua Cas ID.

## Kiến trúc (dự kiến)

```
casso-ledger/ (pnpm + Turborepo)
  apps/backend/           NestJS 10, modular monolith, Clean Architecture 4 lớp/module
  apps/frontend/          React 19 + Vite + Tailwind v4 + shadcn/ui + TanStack Query
  packages/shared-types/  enum, Permission/ROLE_PERMISSIONS, DTO dùng chung BE/FE
```

Stack nền: PostgreSQL 16 (TypeORM) · Redis/BullMQ (queue, cron) · Jest + testcontainers · Biome · Docker Compose.

Chi tiết đầy đủ (module, luồng webhook/matching, RBAC, billing, data model...) → [OVERVIEW.md](OVERVIEW.md).

## Getting Started

Chưa scaffold — sẽ cập nhật khi `apps/backend` và `apps/frontend` được khởi tạo theo [project-scaffolding spec](docs/superpowers/specs/2026-08-03-project-scaffolding-architecture-design.md). Yêu cầu dự kiến: Node 20+, pnpm 10.x, Docker (Postgres 16 + Redis).

## Tài liệu

| Nội dung | Đường dẫn |
|---|---|
| Tổng quan sản phẩm, module, kiến trúc, quyết định thiết kế | [OVERVIEW.md](OVERVIEW.md) |
| Spec chi tiết từng module | [docs/superpowers/specs/](docs/superpowers/specs/) |
| Kế hoạch triển khai | [docs/superpowers/plans/](docs/superpowers/plans/) |
| Thứ tự implement | [docs/superpowers/IMPLEMENTATION-ORDER.md](docs/superpowers/IMPLEMENTATION-ORDER.md) |
| Architecture Decision Records | [docs/adr/](docs/adr/) |

## License

Private / nội bộ CASSO — chưa xác định license công khai.
