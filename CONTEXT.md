# Context — Casso Ledger

## What is this?

Nền tảng B2B SaaS tự động hóa quản lý và thu hồi công nợ phải thu (Accounts Receivable) cho doanh nghiệp Việt Nam. Kết nối trực tiếp dữ liệu giao dịch ngân hàng thời gian thực qua Cas ID/CASSO Balance Hook.

## Product定位

*Nền tảng tự động hóa toàn bộ vòng đời công nợ phải thu dựa trên dữ liệu giao dịch ngân hàng thời gian thực* — khác biệt chính là kết nối trực tiếp với dòng tiền thực tế, không chỉ quản lý danh sách hóa đơn.

## Core Domain Entities

| Entity | Description | Key Fields |
|--------|-------------|------------|
| **Organization** | Tenant boundary, đơn vị tổ chức | `id`, `name` |
| **User** | Tài khoản đăng nhập, thuộc 1+ organization | `id`, `email`, `name` |
| **Membership** | Liên kết User ↔ Organization với role | `userId`, `organizationId`, `role` |
| **Customer** | Khách hàng nợ tiền | `id`, `organizationId`, `name`, `taxCode`, `creditLimit`, `defaultPaymentTermDays` |
| **Invoice** | Hóa đơn | `id`, `organizationId`, `customerId`, `invoiceNumber`, `totalAmount`, `sourceType` |
| **Receivable** | Khoản phải thu | `id`, `organizationId`, `customerId`, `originalAmount`, `paidAmount`, `dueDate`, `status` |
| **Payment** | Thanh toán từ giao dịch ngân hàng | `id`, `organizationId`, `customerId`, `totalAmount`, `allocatedAmount`, `payerName` |
| **PaymentAllocation** | Phân bổ payment → receivable | `id`, `paymentId`, `receivableId`, `allocatedAmount`, `deletedAt` |
| **BankTransaction** | Giao dịch đã normalize | `id`, `organizationId`, `status`, `amount`, `referenceCode` |
| **WebhookInbox** | Raw webhook payload | `id`, `providerTransactionId`, `status`, `payload` |
| **Dispute** | Tranh chấp | `id`, `receivableId`, `status` |
| **ReminderPolicy** | Chính sách nhắc theo nhóm khách | `id`, `customerGroup`, `offsetDays` |
| **ReminderExecution** | Lịch sử gửi nhắc | `id`, `reminderRuleId`, `status`, `sentAt` |
| **EmailTemplate** | Template email HTML + Handlebars | `id`, `bodyHtml`, `isDefault` |
| **CollectionActivity** | Timeline denormalized, INSERT-only | `id`, `receivableId`, `eventType` |
| **InternalTask** | Task nội bộ ESCALATION/MANUAL | `id`, `receivableId`, `status` |
| **AuditLog** | Lịch sử thay đổi, INSERT-only | `id`, `entityType`, `entityId`, `beforeState`, `afterState` |
| **BankConnection** | Kết nối ngân hàng qua Cas ID | `id`, `organizationId`, `status`, `accessToken` |
| **Subscription** | Gói subscription | `id`, `organizationId`, `plan`, `status` |
| **CopilotConversation** | Hội thoại chat với AI | `id`, `organizationId` |
| **CopilotPendingAction** | Action chờ xác nhận từ user | `id`, `conversationId`, `status` |

## Receivable State Machine

```
                    ┌─────────────┐
                    │   DRAFT     │ (optional, cho import)
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
            └───▶│   PAID   │ (terminal)
                 └──────────┘

    CANCELLED: only from OPEN/PARTIALLY_PAID when paidAmount = 0
```

## Business Rules (CRITICAL —违反即 bug)

1. **Money:** integer đơn vị đồng, KHÔNG dùng float/decimal tự do
2. **Transactions:** mọi write thay đổi số tiền/status PHẢI trong 1 DB transaction
3. **Persisted rollup:** `paidAmount` và `allocatedAmount` chỉ cập nhật trong transaction có row lock
4. **Derived fields:** `remainingAmount`, `unallocatedAmount`, `isOverdue`, `isDisputed` — tính tại query time
5. **Tenant isolation:** mọi query/write phải scope theo `organizationId`
6. **Allocation:** `Payment.customerId` PHẢI tồn tại và trùng `Receivable.customerId`
7. **Undo:** soft-delete + audit, không xóa vật lý
8. **Terminal statuses:** PAID, WRITTEN_OFF, CANCELLED — không thể chuyển tiếp

## RBAC

5 roles: `OWNER` > `FINANCE_MANAGER` > `ACCOUNTANT` > `SALES_REP` > `VIEWER`

| Permission | OWNER | FINANCE_MGR | ACCOUNTANT | SALES_REP | VIEWER |
|-----------|-------|-------------|------------|-----------|--------|
| RECEIVABLE_READ | ✓ | ✓ | ✓ | ✓ (own) | ✓ |
| RECEIVABLE_WRITE | ✓ | ✓ | ✓ | — | — |
| RECEIVABLE_WRITE_OFF | ✓ | ✓ | — | — | — |
| PAYMENT_ALLOCATE | ✓ | ✓ | ✓ | — | — |
| PAYMENT_ALLOCATE_UNDO | ✓ | ✓ | — | — | — |
| BANK_CONNECTION_MANAGE | ✓ | — | — | — | — |
| SUBSCRIPTION_MANAGE | ✓ | — | — | — | — |
| USER_MANAGE | ✓ | ✓ | — | — | — |

**SALES_REP:** chỉ xem receivable của khách mình phụ trách (`WHERE salesRepresentativeId = ctx.userId`)

## API Conventions

- **Prefix:** `/api/v1` cho tất cả business API
- **Error:** `{ statusCode, errorCode, message, details? }`
- **Idempotency:** header `Idempotency-Key` cho POST tạo mới/đổi tiền-trạng thái
- **Health:** `GET /health`, `GET /metrics` (Prometheus)
- **Timezone:** `Asia/Ho_Chi_Minh` cho reminder cron/today

## Matching Engine (Webhook → Payment)

```
Score ≥ 90:  Auto payment allocation
Score 60-89: Exception Queue (human review)
Score < 60:  UNMATCHED

Score components:
  referenceCodeScore (0-60) + amountScore (0-20) + customerBankAccountScore (0-10)
  + payerNameScore (0-5) + timingScore (0-5)
```

## Architecture Decisions (ADR)

| ADR | Decision | Rationale |
|-----|----------|-----------|
| 0001 | Shared-schema multi-tenancy | `organizationId` trên mọi bảng, không RLS ở MVP |
| 0002 | Persisted rollup | Không `SUM(PaymentAllocation)` runtime |
| 0003 | isDisputed computed | `EXISTS(SELECT 1 FROM disputes WHERE status='OPEN')` |
| 0004 | Reminder scan/send split | Cron enqueue, worker re-check trước khi gửi |

## Constraints

- Số tiền: integer đơn vị đồng
- `domain/` không import NestJS/TypeORM
- `synchronize: true` ở MVP, migration-based khi cần
- Frontend chưa scaffold (Plan #18-21)
- Auth chưa implement (Plan #4)
- Multi-tenancy chưa implement (Plan #2)
