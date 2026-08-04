# CASSO Accounts Receivable Automation — Tổng quan dự án

## 1. Giới thiệu sản phẩm

- **Tên đề tài (VI):** Xây dựng nền tảng tự động hóa quản lý và thu hồi công nợ doanh nghiệp dựa trên dữ liệu giao dịch ngân hàng thời gian thực.
- **Tên đề tài (EN):** Design and Development of a Real-Time Accounts Receivable Automation Platform.
- **Sản phẩm:** Nền tảng B2B SaaS do CASSO xây dựng. Hệ thống giúp doanh nghiệp theo dõi khoản phải thu, tự động nhắc khách hàng thanh toán, kết nối tài khoản ngân hàng qua Cas ID, nhận dữ liệu giao dịch từ CASSO Balance Hook, tự động đối soát giao dịch với công nợ và đóng công nợ khi nhận đủ tiền.
- **Định vị:** *Nền tảng tự động hóa toàn bộ vòng đời công nợ phải thu dựa trên dữ liệu giao dịch ngân hàng thời gian thực* — khác biệt chính là kết nối trực tiếp với dòng tiền thực tế, không chỉ quản lý danh sách hóa đơn.

## 2. Người dùng

| Đối tượng | Vai trò |
|---|---|
| **CASSO** | Xây dựng, vận hành nền tảng; cung cấp kết nối dữ liệu ngân hàng; quản lý subscription/billing; thu phí SaaS. |
| **Doanh nghiệp (khách hàng của CASSO)** | Người trực tiếp sử dụng sản phẩm: quản lý công nợ, cấu hình lịch nhắc, theo dõi giao dịch, xử lý ngoại lệ, xem báo cáo. |
| **Vai trò trong doanh nghiệp** | Kế toán công nợ, kế toán trưởng, nhân viên tài chính, nhân viên kinh doanh phụ trách khách hàng, trưởng phòng tài chính, chủ doanh nghiệp/CEO. |
| **Khách hàng cuối của doanh nghiệp** | Cá nhân/doanh nghiệp đang nợ tiền; không đăng nhập hệ thống, chỉ nhận email nhắc, thông tin hóa đơn, biên nhận xác nhận thanh toán. |
| **Cas ID** | Là **lớp consent và bank-account connection** — kết nối tài khoản ngân hàng, xác minh/cấp quyền dữ liệu, quản lý ủy quyền, thu hồi quyền. **KHÔNG phải SSO** cho sản phẩm này; không thay thế hệ thống đăng nhập của AR Automation. |

## 3. Bài toán & giá trị

Quy trình thu công nợ thủ công hiện tại (10 bước rút gọn):

1. Xuất hóa đơn / ghi nhận khoản phải thu → 2. Theo dõi hạn bằng Excel → 3. Rà soát hóa đơn đến hạn/quá hạn → 4. Email/gọi nhắc từng khách → 5. Đăng nhập nhiều tài khoản ngân hàng kiểm tra tiền → 6. Đọc nội dung chuyển khoản → 7. Ghép giao dịch với hóa đơn → 8. Cập nhật số tiền đã trả → 9. Dừng nhắc khi trả đủ → 10. Tổng hợp báo cáo cho quản lý.

**Vấn đề:** tốn thời gian kiểm tra ngân hàng; dễ quên nhắc; khách chuyển sai nội dung/trả một phần/một giao dịch trả nhiều hóa đơn; tiền đã về vẫn bị nhắc; khó dự báo dòng tiền thu; thiếu lịch sử nhắc nợ.

**Giá trị:** giảm thời gian kế toán; tự ghi nhận thanh toán khi tiền về; giảm nhắc nhầm khách đã trả; tăng tỷ lệ thu đúng hạn; giảm nợ quá hạn; dữ liệu ưu tiên xử lý; dự báo thu tiền 7/14/30 ngày; tạo sản phẩm SaaS thương mại hóa cho CASSO.

## 4. Quy trình nghiệp vụ tổng quát

```text
Tạo hóa đơn / công nợ (thủ công hoặc import Excel/CSV)
        ↓
Cấu hình lịch nhắc theo nhóm khách (VIP/REGULAR) + số ngày cách dueDate
        ↓
Kết nối tài khoản ngân hàng qua Cas ID (OAuth-style, quét QR)
        ↓
CASSO Balance Hook gửi webhook giao dịch
        ↓
Xác thực → WebhookInbox (idempotent) → Normalizer → Matching Engine
        ↓
┌────────────────────────┬───────────────────────┬────────────────┐
│ score ≥ 90             │ score 60–89           │ score < 60     │
│ Auto payment allocation│ Exception Queue       │ UNMATCHED      │
└────────────────────────┴───────────────────────┴────────────────┘
        ↓
Cập nhật paidAmount → đủ tiền thì đóng công nợ (PAID), hủy nhắc còn lại
        ↓
Báo cáo aging / dự báo thu tiền / Copilot hỗ trợ kế toán
```

## 5. Ví dụ nghiệp vụ

Ví dụ minh họa từ [domain-core spec mục 5](docs/superpowers/specs/2026-08-03-domain-core-design.md):

```text
Invoice INV-2026-0012: 50.000.000 đồng, due 20/08/2026
→ Receivable R1 (status OPEN, originalAmount 50.000.000)

Payment P1: 30.000.000 (payerName "Công ty B")
→ PaymentAllocation P1 → R1: 30.000.000
→ R1.paidAmount = 30.000.000, remainingAmount = 20.000.000 → PARTIALLY_PAID

Payment P2: 25.000.000
→ PaymentAllocation P2 → R1: 20.000.000 (chỉ đủ phần còn thiếu)
→ P2.unallocatedAmount = 5.000.000 → giữ làm credit balance của Công ty B
→ R1.paidAmount = 50.000.000, remainingAmount = 0 → PAID (terminal)
→ Hủy reminder còn lại, gửi email xác nhận
```

## 6. Module chức năng

| Module | Spec |
|---|---|
| Organization / Multi-tenancy | [multi-tenancy-rbac-design](docs/superpowers/specs/2026-08-03-multi-tenancy-rbac-design.md) |
| Customer | [domain-core-design](docs/superpowers/specs/2026-08-03-domain-core-design.md) |
| Invoice | [domain-core-design](docs/superpowers/specs/2026-08-03-domain-core-design.md) + [invoice-import-design](docs/superpowers/specs/2026-08-03-invoice-import-design.md) |
| Receivable | [domain-core-design](docs/superpowers/specs/2026-08-03-domain-core-design.md) |
| Reminder | [reminder-automation-design](docs/superpowers/specs/2026-08-03-reminder-automation-design.md) |
| Email template | [email-template-management-design](docs/superpowers/specs/2026-08-03-email-template-management-design.md) |
| Cas ID / bank connection | [cas-id-bank-connection-design](docs/superpowers/specs/2026-08-03-cas-id-bank-connection-design.md) |
| Webhook + matching | [webhook-matching-engine-design](docs/superpowers/specs/2026-08-03-webhook-matching-engine-design.md) |
| Payment allocation | [domain-core-design](docs/superpowers/specs/2026-08-03-domain-core-design.md) |
| Exception queue + Audit log | [exception-queue-audit-log-design](docs/superpowers/specs/2026-08-03-exception-queue-audit-log-design.md) |
| Aging / reporting | [aging-dashboard-reporting-design](docs/superpowers/specs/2026-08-03-aging-dashboard-reporting-design.md) |
| Dispute | [dispute-management-design](docs/superpowers/specs/2026-08-03-dispute-management-design.md) |
| Collection activity | [collection-activity-timeline-design](docs/superpowers/specs/2026-08-03-collection-activity-timeline-design.md) |
| Internal task | [internal-task-escalation-design](docs/superpowers/specs/2026-08-03-internal-task-escalation-design.md) |
| Copilot | [collection-copilot-design](docs/superpowers/specs/2026-08-03-collection-copilot-design.md) |
| Auth | [authentication-onboarding-design](docs/superpowers/specs/2026-08-03-authentication-onboarding-design.md) |
| Billing | [billing-usage-metering-design](docs/superpowers/specs/2026-08-03-billing-usage-metering-design.md) |
| Frontend / Scaffolding / Testing / Deployment | [frontend-design-system](docs/superpowers/specs/2026-08-03-frontend-design-system.md) · [project-scaffolding-architecture-design](docs/superpowers/specs/2026-08-03-project-scaffolding-architecture-design.md) · [testing-strategy-design](docs/superpowers/specs/2026-08-03-testing-strategy-design.md) · [deployment-observability-design](docs/superpowers/specs/2026-08-03-deployment-observability-design.md) |

Chi tiết từng module (entity, business rule, trạng thái thiết kế) nằm trong spec tương ứng.

## 7. AI — Collection Copilot

Thiết kế theo [collection-copilot spec](docs/superpowers/specs/2026-08-03-collection-copilot-design.md) — **chat tool-based**, không phải 2 action cố định:

```
Tools (read-only, trả structured data đã tính sẵn, không trả raw SQL):
  getReceivableSummary(customerId)
  getCollectionActivityTimeline(customerId, limit)
  getPaymentHistory(customerId, limit)

Tools (action, cần confirmation):
  draftReminderEmail(receivableId, tone?) → tạo draft, KHÔNG gửi
  sendReminderEmail({draftId, receivableId}) → chỉ đề xuất; chỉ endpoint confirm thuần code mới gửi thật
```

**Luồng 1 lượt chat:**

1. User gửi tin nhắn → model gọi 0..N tool đọc để lấy context.
2. Model đề xuất `sendReminderEmail` → **không bao giờ chạy trong lượt model**: chặn thành `CopilotPendingAction` trả cho UI dạng thẻ xác nhận.
3. User bấm "Xác nhận" → FE gọi `POST /api/v1/copilot/actions/:id/confirm`; bấm hủy gọi `POST /api/v1/copilot/actions/:id/cancel` → **endpoint thuần code** (không đi qua LLM), lần xác nhận mới thực thi gửi email qua EmailService.

**Guardrail bắt buộc:** timeout cứng 15s/lượt model, tối đa 1 retry; pending action hết hạn sau 10 phút (`EXPIRED`); mọi request ghi `AIUsageLog`; không đưa accessToken/credential vào prompt; tool chỉ trả dữ liệu trong `organizationId` của user; chỉ user có `REMINDER_SEND_MANUAL` thấy action; write-off/allocate/dispute **không bao giờ** có tool cho Copilot — ranh giới cứng.

## 8. Phạm vi & ngoài phạm vi

**Kiến trúc:** modular monolith — một process, có thể tách service sau khi cần.

**Loại khỏi phạm vi MVP (tinh thần mục 9 doc gốc):**

- Microservices đầy đủ; Kafka (BullMQ đã đáp ứng); Kubernetes production-grade.
- Dự báo dòng tiền bằng ML (giữ rule-based naive forecast 7/14/30 ngày); chatbot tổng quát.
- CASSO Admin portal; customer portal hoàn chỉnh cho khách cuối.
- Zalo OA/SMS cùng lúc; ERP/CRM connector thực tế đa nhà cung cấp.
- Multi-currency phức tạp; chuyển tiền/thu tiền tự động; event sourcing toàn hệ thống.
- SSO/OAuth social login, 2FA/MFA (Enterprise sau).

## 9. Mô hình thu phí & Billing

Theo [billing-usage-metering spec](docs/superpowers/specs/2026-08-03-billing-usage-metering-design.md):

**2 metric gate MVP:**

```
receivablesThisMonth  = COUNT(Receivable WHERE organizationId=? AND createdAt giữa kỳ)
activeBankConnections = COUNT(BankConnection WHERE organizationId=? AND status='ACTIVE')
```

- Đếm **write-time từ bảng nguồn** (`receivables`, `bank_connections`) — **KHÔNG có bảng usage tracking** (`UsageRecord`/`UsageAggregate`).
- Chặn cứng trong cùng transaction tạo mới: vượt hạn mức → `402 "Đã đạt giới hạn gói {planName}, nâng cấp để tiếp tục"` (áp cho `POST /receivables` và `POST /bank-connections/cas-id/sessions/:id/exchange`).
- `Subscription` snapshot hai limit; không có bảng `Plan` catalog ở MVP; signup luôn tạo `Subscription(ACTIVE, FREE)` cùng transaction.

**Gói tham khảo (giá brainstorm, không chính thức):**

| Gói | Receivable/tháng | Bank connection | Ghi chú |
|---|---|---|---|
| FREE | 50 | 1 | Dashboard cơ bản, import Excel |
| STARTER | 500 | 2 | Nhắc tự động, matching cơ bản, thanh toán một phần |
| BUSINESS | 5.000 | Nhiều | Chính sách nhắc tùy chỉnh, Exception Queue, báo cáo nâng cao |
| ENTERPRISE | Tùy chỉnh | Tùy chỉnh | SSO, nhiều pháp nhân, SLA (ngoài MVP) |

Ngoài phạm vi: overage billing, grace period, billing invoice tự động qua CASSO.

## 10. Phân quyền

5 role cố định theo [multi-tenancy spec mục 2](docs/superpowers/specs/2026-08-03-multi-tenancy-rbac-design.md) (set cứng trong code, không có bảng Role/Phân quyền động):

| Permission | OWNER | FINANCE_MANAGER | ACCOUNTANT | SALES_REP | VIEWER |
|---|---|---|---|---|---|
| RECEIVABLE_READ | ✔ | ✔ | ✔ | ✔ (giới hạn) | ✔ |
| RECEIVABLE_WRITE | ✔ | ✔ | ✔ | — | — |
| RECEIVABLE_WRITE_OFF | ✔ | ✔ | — | — | — |
| RECEIVABLE_DISPUTE | ✔ | ✔ | ✔ | — | — |
| PAYMENT_ALLOCATE / UNDO | ✔ | ✔ / ✔ | ✔ / — | — | — |
| REMINDER_POLICY_WRITE | ✔ | ✔ | — | — | — |
| REMINDER_SEND_MANUAL | ✔ | ✔ | ✔ | — | — |
| BANK_CONNECTION_MANAGE | ✔ | — | — | — | — |
| SUBSCRIPTION_MANAGE / USER_MANAGE | ✔ | — / ✔ | — | — | — |
| REPORT_READ | ✔ | ✔ | ✔ | ✔ | ✔ |
| AUDIT_LOG_READ | ✔ | ✔ | — | — | ✔ |

- Permission check ở **backend qua decorator** `@RequirePermission(Permission.X)` + `PermissionGuard`.
- **FE ẩn button khi thiếu quyền** (không disable) qua hàm `hasPermission(role, permission)` từ `shared-types` (ROLE_PERMISSIONS dùng chung BE/FE).
- **SALES_REP đặc biệt:** chỉ xem receivable của khách mình phụ trách — lọc `WHERE salesRepresentativeId = ctx.userId` ở **tầng Service**, không nằm trong PermissionGuard chung.
- JWT payload nhúng sẵn `role` (hiệu lực tối đa 15 phút khi đổi role, chấp nhận độ trễ).

## 11. Kiến trúc kỹ thuật

Theo [project-scaffolding spec](docs/superpowers/specs/2026-08-03-project-scaffolding-architecture-design.md) và [deployment spec](docs/superpowers/specs/2026-08-03-deployment-observability-design.md):

```
casso-ledger/ (pnpm + Turborepo)
  apps/backend/     NestJS 10 modular monolith (API + BullMQ worker cùng process)
  apps/frontend/    React 19 + Vite + Tailwind v4 + shadcn/ui ("new-york"/"neutral")
                    + TanStack Query + React Router 7 + sonner + recharts + qrcode.react
  packages/shared-types/   enum status, Permission/ROLE_PERMISSIONS, DTO shape dùng chung BE/FE
```

**Clean Architecture 4 lớp mỗi module BE** (`domain/application/infrastructure/presentation`):

- `domain/`: entity thuần TS, state machine, domain error — **không import NestJS/TypeORM**.
- `application/`: use-case + port interface (`I<Entity>Repository`, `EmailProviderAdapter`, `CasIdIntegrationAdapter`).
- `infrastructure/`: TypeORM repository, adapter cụ thể (Resend, Cas ID mock/thật).
- `presentation/`: controller, DTO, DI wiring. Dependency: `presentation → application → domain`, `infrastructure → application`.

**Stack nền:** PostgreSQL 16 (shared-schema, TypeORM) + Redis/BullMQ (queue, daily cron); Jest + testcontainers (Postgres/Redis thật cho integration test); Biome (format+lint, thay ESLint/Prettier); Docker Compose 4 service (backend, frontend/nginx, postgres, redis); `GET /health` (503 nếu dependency fail), `GET /metrics` (Prometheus, 4 series bắt buộc), structured JSON log ra stdout.

**Luồng webhook (theo [webhook spec](docs/superpowers/specs/2026-08-03-webhook-matching-engine-design.md)):**

```text
CASSO Balance Hook (POST /webhooks/casso-balance-hook)
  → xác thực header client ID + secret key (constant-time compare), sai → 401
  → WebhookInbox insert, unique(providerTransactionId); trùng → 200 ngay, không xử lý tiếp
  → Queue (BullMQ) → Transaction Normalizer → Matching Engine
  → score ≥ 90: Payment Allocation tự động
  → score 60–89: Exception Queue
  → score < 60: status = UNMATCHED
```

## 12. Quyết định thiết kế quan trọng

Chỉ liệt kê quyết định đã được spec chốt:

| # | Quyết định | Chi tiết |
|---|---|---|
| 1 | Số dư là rollup | `paidAmount`/`allocatedAmount` là rollup cập nhật **trong cùng transaction** allocation/undo; `remainingAmount`/`unallocatedAmount` là derived field tính tại query-time. Không service nào sửa rollup riêng lẻ. ([domain-core mục 2](docs/superpowers/specs/2026-08-03-domain-core-design.md), ADR 0002) |
| 2 | Status receivable | `DRAFT/OPEN/PARTIALLY_PAID/PAID/WRITTEN_OFF/CANCELLED`. `OVERDUE` và `isDisputed` là **computed flag, KHÔNG phải status**. Terminal: `PAID/WRITTEN_OFF/CANCELLED`; `CANCELLED` chỉ hợp lệ khi `paidAmount == 0` (đã có tiền vào thì chỉ đi WRITTEN_OFF). ([domain-core mục 3](docs/superpowers/specs/2026-08-03-domain-core-design.md), ADR 0003) |
| 3 | Money & transaction | Số tiền là integer đơn vị đồng (không float); mọi allocation/write-off/undo chạy trong **1 DB transaction** có lock; allocation vượt `remainingAmount` bị chặn ở DB + application; Exception Queue dùng optimistic lock `version`. ([domain-core mục 4](docs/superpowers/specs/2026-08-03-domain-core-design.md), [exception-queue mục 1](docs/superpowers/specs/2026-08-03-exception-queue-audit-log-design.md)) |
| 4 | Idempotency webhook | `unique(providerTransactionId)` trên `WebhookInbox`; duplicate → 200 no-op; lỗi xử lý → retry có backoff tối đa N lần rồi **DLQ**. Giao dịch âm (refund) không vào matching. ([webhook mục 4](docs/superpowers/specs/2026-08-03-webhook-matching-engine-design.md)) |
| 5 | Email | Gửi qua **Resend + BullMQ queue** (`attempts: 3`, exponential backoff); worker cập nhật `ReminderExecution` (SENT chỉ khi có `providerMessageId`); Copilot confirm **không qua LLM**. ([email-notification mục 1-2](docs/superpowers/specs/2026-08-03-email-notification-service-design.md)) |
| 6 | Signup bootstrap | Organization + User + Membership(OWNER) + Subscription(FREE) + **4 email template mặc định** + reminder rules mặc định tạo trong **1 transaction**. ([auth mục 2](docs/superpowers/specs/2026-08-03-authentication-onboarding-design.md), [email-template mục 2](docs/superpowers/specs/2026-08-03-email-template-management-design.md)) |
| 7 | Scoring matching | `referenceCodeScore` (0-60) + `amountScore` (0-20) + `customerBankAccountScore` (0-10) + `payerNameScore` (0-5) + `timingScore` (0-5); threshold ≥90 auto / 60-89 exception / <60 unmatched. ([webhook mục 3](docs/superpowers/specs/2026-08-03-webhook-matching-engine-design.md)) |
| 8 | Tenant isolation | Shared-schema + `BaseRepository` tự chèn `organizationId`; không RLS ở MVP. ([multi-tenancy mục 1](docs/superpowers/specs/2026-08-03-multi-tenancy-rbac-design.md), ADR 0001) |
| 9 | Reporting | Real-time raw SQL, **không precompute**; index `Receivable(organizationId, status, dueDate)`. ([aging mục 1](docs/superpowers/specs/2026-08-03-aging-dashboard-reporting-design.md)) |
| 10 | Reminder race | Tách cron quét (enqueue) khỏi worker gửi thật (re-check trạng thái fresh trước khi gửi). Cron/"today" cố định timezone `Asia/Ho_Chi_Minh`, không dùng giờ server. ([reminder mục 3](docs/superpowers/specs/2026-08-03-reminder-automation-design.md), ADR 0004) |
| 11 | API conventions | Error trả `{ statusCode, errorCode, message, details? }`; `POST` tạo mới/đổi tiền-trạng thái do FE gọi nhận header `Idempotency-Key` (trừ webhook, đã có `providerTransactionId`). ([project-scaffolding mục 5](docs/superpowers/specs/2026-08-03-project-scaffolding-architecture-design.md)) |

## 13. Data model tóm tắt

Danh sách entity chính (chi tiết field/ERD trong từng spec, không vẽ ERD ở đây):

| Entity | 1 dòng mô tả |
|---|---|
| `Organization` / `User` / `Membership` | Tenant + tài khoản đăng nhập + liên kết nhiều-org với role (OWNER/FINANCE_MANAGER/ACCOUNTANT/SALES_REP/VIEWER). ([multi-tenancy](docs/superpowers/specs/2026-08-03-multi-tenancy-rbac-design.md)) |
| `Customer` | Khách hàng nợ tiền: taxCode, email, phone, payment terms, credit limit, `customerGroup` (VIP/REGULAR). |
| `Invoice` | Hóa đơn: `invoiceNumber`, `totalAmount`, `sourceType` (MANUAL/IMPORT/API/ERP), 1–N Receivable. |
| `Receivable` | Khoản phải thu: `originalAmount`, `paidAmount` (rollup), `dueDate`, status, `ownerUserId`. |
| `Payment` | Thanh toán từ giao dịch ngân hàng: `totalAmount`, `allocatedAmount` (rollup), `payerName`; phần dư = credit balance. |
| `PaymentAllocation` | Phân bổ Payment → Receivable; source of truth lịch sử; soft-delete khi undo. |
| `BankTransaction` | Giao dịch đã normalize: status UNMATCHED/PENDING_REVIEW/MATCHED, `version` (optimistic lock). |
| `MatchingCandidate` | Ứng viên khớp + 5 thành phần điểm + `totalScore`. |
| `WebhookInbox` | Raw payload, `unique(providerTransactionId)`, status RECEIVED/PROCESSED/FAILED, retryCount. |
| `Dispute` | Tranh chấp OPEN/RESOLVED; `isDisputed` = EXISTS(OPEN). |
| `ReminderPolicy` / `ReminderRule` / `ReminderExecution` | Chính sách nhắc theo customerGroup + offsetDays; execution PENDING/SENT/FAILED/SKIPPED (skipReason: ALREADY_PAID/DISPUTED/RATE_LIMITED). |
| `EmailTemplate` | HTML + Handlebars, `isDefault` (seed, không xóa), 7 biến hệ thống. |
| `CollectionActivity` | Timeline denormalized; INSERT-only. |
| `InternalTask` | Task nội bộ ESCALATION/MANUAL, status OPEN/DONE/DISMISSED. |
| `AuditLog` | `@Audited` + interceptor, before/afterState jsonb, INSERT-only. |
| `BankConnection` / `CasIdConnectionSession` / `ConnectionAuditEvent` | Kết nối ngân hàng: accessToken mã hóa at-rest, 6 status (ACTIVE/REQUIRES_REAUTHORIZATION/...), audit sự kiện kết nối. |
| `Subscription` | Gói FREE/STARTER/BUSINESS/ENTERPRISE + 2 limit snapshot + kỳ hiện tại. |
| `CopilotConversation` / `CopilotMessage` / `CopilotPendingAction` / `AIUsageLog` | Hội thoại chat, pending action (SEND_REMINDER_EMAIL, EXPIRED sau 10 phút), log usage model. |
| Token entities | `EmailVerificationToken`, `PasswordResetToken`, `MembershipInvite`, `RefreshToken` — đều lưu hash (SHA-256), không plaintext. ([auth mục 1](docs/superpowers/specs/2026-08-03-authentication-onboarding-design.md)) |

## 14. Giao diện người dùng

**10 mục nav** theo [FE design spec mục 2](docs/superpowers/specs/2026-08-03-frontend-design-system.md):

```
/dashboard · /customers · /receivables · /bank-connections · /transactions
/exceptions (badge = count PENDING_REVIEW) · /reminders · /copilot · /reports · /settings
```

- Design token CASSO/payOS: primary `#16AB64` (oklch), font "Be Vietnam Pro", shadcn/ui "new-york"/"neutral", lucide icons, light + dark.
- **Route riêng** cho chi tiết: `/receivables/:id`, `/customers/:id` (3 tab payments/timeline/tasks; allocations nằm trong `GET /receivables/:id`, không gọi endpoint riêng).
- **Matching workspace** dạng list + detail sheet: 5 dòng score breakdown, candidate chính highlight, nút "Khớp công nợ" mở match dialog.
- **Exception Queue:** split match nhiều receivable một lần submit kèm `version`; skip; mark-prepaid (credit balance).
- **Copilot:** chat message list + input; khi có `pendingAction` hiện **thẻ xác nhận (Xác nhận/Hủy)** — confirm/cancel không quay lại LLM. Nav Copilot gated gói STARTER (hiện icon khóa, không ẩn).
- RBAC FE: `hasPermission()` ẩn button; route-gate chi tiết chỉ cho `/settings`; bảng users tab (invite) chỉ OWNER/FINANCE_MANAGER.
- `dashboard` (reports): aging chart (recharts) + summary cards; settings gồm billing/static plan + users + email templates CRUD/preview.

## 15. Chỉ số hiệu quả (KPI)

- **Auto-match rate** — % giao dịch tự khớp công nợ.
- **Manual handling rate** — % giao dịch cần kế toán xử lý (Exception Queue) = 1 − auto-match rate.
- **Match accuracy** — % kết quả auto-match đúng.
- **Average collection time** — thời gian trung bình từ xuất hóa đơn đến nhận đủ tiền.
- **DSO (Days Sales Outstanding)** — số ngày trung bình thu tiền sau bán hàng.
- **Overdue rate** — % công nợ quá hạn.
- **Reminder effectiveness** — % khách thanh toán sau email nhắc (metric follow-up, chưa trong dashboard MVP).
- **Recovered overdue amount** — số tiền quá hạn thu hồi được.
- **Email delivery rate** — % email gửi thành công (SENT / tổng execution).
- **Time saved** — thời gian thủ công được cắt giảm cho kế toán.
- **Forecast accuracy** — độ chính xác dự báo thu tiền (7/14/30 ngày).

## 16. Non-functional requirements

- **Security:** TLS mọi kết nối; mã hóa dữ liệu nhạy cảm (accessToken at-rest, không log plaintext); không lưu credential ngân hàng không cần thiết; RBAC + tenant isolation; rate limiting `/auth/*` (5 req/phút theo IP+email); webhook auth constant-time compare; audit log; consent scope tối thiểu; không dùng Cas ID làm SSO.
- **Reliability:** webhook không mất (inbox trước khi xử lý); retry backoff; DLQ cho job lỗi; idempotency unique key (webhook: `providerTransactionId`; API do FE gọi: header `Idempotency-Key`); DB transaction cho mọi thay đổi tiền/status; backup: `pg_dump` cron hàng ngày, giữ 7 bản gần nhất ([deployment mục 5](docs/superpowers/specs/2026-08-03-deployment-observability-design.md)).
- **Performance:** query real-time với index đúng (`Receivable(organizationId, status, dueDate)`) — **không precompute** ở quy mô MVP; matching chạy bất đồng bộ qua queue; phân trang mọi list (`page/limit`, tối đa 100).
- **Observability:** structured JSON log ra stdout (timestamp, level, organizationId, userId, requestId); `/metrics` Prometheus (http duration, webhook duration, bullmq failed/backlog); `/health` 503 khi dependency fail; distributed tracing hoãn (modular monolith một process).
- **Compliance:** chính sách retention; export dữ liệu; xóa/ẩn dữ liệu theo yêu cầu hợp lệ; lịch sử thay đổi thông tin tài chính (AuditLog INSERT-only).

## 17. Rủi ro

- **Matching sai** → chỉ auto-match khi score ≥ 90; hiển thị explanation (5 thành phần điểm); undo allocation; audit log; human review cho case không chắc chắn.
- **Quyền Cas ID bị thu hồi** → lazy detection (401/403 → REQUIRES_REAUTHORIZATION); cảnh báo Owner; dừng nhận giao dịch mới cho connection không ACTIVE; không xóa lịch sử; reauthorization bằng QR; không tự thay tài khoản khác.
- **Yêu cầu quyền dữ liệu quá rộng** → least privilege, chỉ yêu cầu dữ liệu đối soát, hiển thị scope trước khi cấp quyền, thu hồi được, lịch sử consent.
- **Email làm phiền khách** → rate limit `minIntervalDays`, chính sách theo nhóm khách, tạm dừng khi dispute.
- **Khách đã trả vẫn bị nhắc** → xử lý gần real-time, worker re-check trạng thái ngay trước khi gửi, hủy execution chưa gửi khi PAID.
- **Dữ liệu nhiều nguồn không đồng nhất** → canonical data model, adapter abstraction, import validation từng dòng.
- **Tính phí sai** → đếm write-time từ bảng nguồn trong cùng transaction (chống race), audit trail.
- **Doanh nghiệp không muốn thay phần mềm kế toán** → định vị là lớp automation/integration, không phải phần mềm kế toán thay thế.

## 18. Nguồn tham khảo

Tài liệu chính thức về Cas ID / CASSO, truy cập tháng 08/2026:

- [Cas ID – Ví dữ liệu kinh doanh](https://cas.so/cas-id/)
- [CASSO Docs – Kết nối tài khoản ngân hàng qua quét QR trên App Cas ID](https://docs.casso.vn/huong-dan/ket-noi-tai-khoan-ngan-hang-thong-qua-cas-id)
- [CASSO Developer](https://developer.casso.vn/)
- [Cas ID trên Google Play](https://play.google.com/store/apps/details?id=vn.bankhub.mobile&hl=vi)
- [Balance Hook](https://cas.so/product/balance-hook) — payload, xác thực header, real-time số dư.
- [Cas ID Quickstart](https://cas.so/quickstart) — luồng grant/exchange token kiểu OAuth.

Chi tiết API (endpoint tạo QR, callback, scope, event thu hồi quyền) cần xác nhận với Developer Portal / tài liệu kỹ thuật nội bộ trước khi triển khai production — hiện dùng `MockCasIdAdapter` cho demo/test.

## 19. Kết luận

Dự án kết hợp domain Accounts Receivable, tích hợp Cas ID/Balance Hook thật, xử lý webhook idempotency và payment matching, automation qua email, cùng một Copilot có guardrail và human-in-the-loop — đủ sâu để thể hiện năng lực thiết kế hệ thống và hoàn thành được vertical slice demo trong thời gian ngắn.

Điểm cốt lõi của sản phẩm không phải chỉ là gửi email nhắc nợ: **hệ thống tự biết khoản nào cần nhắc, khi nào cần nhắc, ai cần nhận thông báo, tiền nào đã về, giao dịch nào thuộc công nợ nào và khi nào cần dừng toàn bộ quy trình nhắc.** Tất cả quyết định này đã được chốt thành spec/plan trong `docs/superpowers/`; doc này chỉ là lối vào tổng quan cho toàn bộ dự án.
