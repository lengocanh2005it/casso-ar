# Context — Casso Ledger

## What is this?

Hệ thống quản lý nợ phải thu (Accounts Receivable) giúp doanh nghiệp Việt Nam theo dõi hóa đơn, khách hàng, thanh toán và quá hạn.

## Key Domain Terms

| Term | Definition |
|------|-----------|
| **Receivable** | Nợ phải thu — số tiền khách hàng còn nợ. Có��态: OPEN, PARTIALLY_PAID, PAID, WRITTEN_OFF, CANCELLED |
| **Payment** | Thanh toán từ khách hàng. Có thể allocate cho nhiều receivable |
| **PaymentAllocation** | Phân bổ một phần payment vào một receivable.Soft-delete khi undo |
| **Customer** | Khách hàng, thuộc về một organization |
| **Invoice** | Hóa đơn, nguồn gốc tạo receivable |
| **Organization** | Đơn vị/tổ chức, boundary của multi-tenancy |

## Architecture Decisions

Xem `docs/adr/` cho các quyết định kiến trúc đã chấp nhận:
- ADR-0001: Shared schema multi-tenancy
- ADR-0002: Persisted rollup cho balances
- ADR-0003: isDisputed là computed field
- ADR-0004: Reminder scan/send split

## Constraints

- Số tiền: integer đơn vị đồng, không dùng float
- Mọi write operation thay đổi số tiền/status phải trong DB transaction
- `paidAmount` (Receivable) và `allocatedAmount` (Payment) là persisted rollup
- `remainingAmount`, `unallocatedAmount`, `isOverdue` là derived field
- `domain/` không import NestJS/TypeORM
