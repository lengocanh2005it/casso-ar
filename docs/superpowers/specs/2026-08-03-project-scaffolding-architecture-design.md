# Project Scaffolding & Architecture Design

> Spec con của [docs/overview.md](../../../docs/overview.md). Định nghĩa cách khởi tạo repo, tổ chức monorepo, kiến trúc mã nguồn BE/FE và nguyên tắc code chung — nền tảng để mọi spec khác (domain-core, webhook-matching-engine, reminder-automation...) có chỗ "sống" cụ thể trong codebase. Dùng cấu trúc tooling chuẩn cho monorepo pnpm/Turborepo (turbo.json, pnpm-workspace.yaml, package.json root).

## 1. Monorepo structure (Turborepo + pnpm)

```
casso-ledger/
  apps/
    backend/     -- NestJS modular monolith
    frontend/    -- React 19 + Vite
  packages/
    shared-types/   -- type dùng chung BE/FE (enum status, DTO shape) — package nội bộ dùng chung BE/FE
  turbo.json
  pnpm-workspace.yaml
  biome.json
  package.json (root)
```

- `packageManager: "pnpm@10.x"`, `engines.node: ">=20"`.
- `turbo.json`: tasks `build`, `dev`, `lint`, `format`, `test`, `type-check`, mỗi task `dependsOn: ["^build"]` khi cần build `packages/shared-types` trước.
- Root scripts: `dev:backend`/`dev:frontend` filter theo `--filter=@casso-ledger/<name>`, `verify` = lint + type-check + test gộp (chạy trước khi mở PR, cũng là lệnh CI chạy).
- Không tạo `packages/eslint-config` hay `packages/ui` riêng ở MVP — chỉ 2 app dùng chung 1 `biome.json` ở root là đủ, tránh package thừa khi chưa có app thứ 3 cần dùng lại (YAGNI).

## 2. Backend — Clean Architecture (4 lớp) + Design Pattern catalog

Mỗi module nghiệp vụ (`receivables`, `payments`, `webhooks`, `reminders`...) tổ chức theo 4 thư mục:

```
apps/backend/src/modules/receivables/
  domain/            -- entity thuần TS (Receivable, state machine), value object, domain error
                        KHÔNG import gì từ NestJS/TypeORM/framework
  application/        -- use-case (vd CreateReceivableUseCase, WriteOffReceivableUseCase),
                        định nghĩa interface/port (IReceivableRepository) mà infrastructure implement
  infrastructure/      -- implementation cụ thể: TypeOrmReceivableRepository, các Adapter
                        (EmailProviderAdapter, CasIdIntegrationAdapter) đã thiết kế ở spec khác
  presentation/         -- controller, DTO request/response, NestJS module wiring (DI binding
                        interface ở application → implementation ở infrastructure)
```

Quy tắc dependency: `presentation → application → domain`, `infrastructure → application` (implement port), `domain` không phụ thuộc ngược lại lớp nào — đảm bảo test `application`/`domain` không cần khởi động NestJS/DB thật (unit test thuần theo đúng phân tầng ở [2026-08-03-testing-strategy-design.md](2026-08-03-testing-strategy-design.md)).

**Design pattern áp dụng** (map vào pattern đã dùng ở các spec trước, không thêm pattern chưa có nhu cầu):

| Pattern | Áp dụng ở đâu |
|---|---|
| Repository | Mọi `I<Entity>Repository` port trong `application/`, implementation TypeORM trong `infrastructure/` |
| Adapter | `EmailProviderAdapter` (Resend), `CasIdIntegrationAdapter` (mock/thật) — cô lập external API |
| Strategy | Matching Engine: mỗi scoring function (`referenceCodeScore`, `amountScore`...) là 1 strategy độc lập, tổng hợp theo formula chung |
| Observer / Event-driven | Domain event (`Receivable.status` đổi, `PaymentAllocation` created) → listener ghi `CollectionActivity`, tạo `InternalTask` — dùng NestJS `EventEmitter2` |
| Use Case (Application Service) | Mỗi hành động nghiệp vụ có 1 use-case class riêng trong `application/`, controller chỉ gọi use-case, không chứa business logic |

Không dùng Factory/Builder/Decorator ở MVP — chưa có entity nào cần khởi tạo phức tạp đủ để cần pattern riêng (YAGNI).

## 3. Frontend — Feature-based structure

```
apps/frontend/src/
  features/
    receivables/      -- components, hooks (useReceivables, useWriteOff...), api/ (TanStack Query), types
    customers/
    bank-connections/
    transactions/       -- matching/reconciliation UI
    exceptions/
    reminders/
    copilot/
    reports/
    settings/           -- billing, user, RBAC
  components/ui/        -- shadcn/ui primitives dùng chung (copy từ CLI, không sửa tay)
  components/layout/     -- Sidebar, MobileSidebarWrapper... (đã thiết kế ở frontend-design-system spec)
  lib/                   -- api client instance, domain-utils chung không thuộc feature nào
  routes/                -- React Router 7 route definitions, map 1-1 với navItems đã chốt
```

Mỗi feature folder tự chứa API call + hook + component riêng của nó — component dùng chung 2+ feature mới đẩy lên `components/`, tránh tách sớm khi chỉ 1 nơi dùng.

### Quy tắc chống lặp code giữa các feature

```
1. Type/enum dùng chung (status, DTO shape của domain-core) → luôn định nghĩa 1 lần
   trong packages/shared-types, import vào cả BE lẫn FE — không định nghĩa lại
   riêng trong từng feature (nguồn lặp phổ biến nhất: enum OPEN/PARTIALLY_PAID/PAID...
   dùng ở receivables, reminders, reports, copilot).

2. API client (base URL, auth header, error interceptor) → 1 instance chung ở lib/api-client.ts,
   mỗi feature/api/ chỉ export các hàm gọi endpoint cụ thể dùng chung instance đó,
   không tự tạo client riêng.

3. Hook/component dùng bởi ĐÚNG 1 feature → để nguyên trong feature đó, không tách sớm.
   "Rule of two": lặp lần 1 thì chấp nhận copy, khi feature THỨ 2 thật sự cần dùng lại
   (không phải "có thể sẽ cần") mới chuyển lên components/ hoặc lib/.

4. Business rule tính toán (vd công thức isOverdue, format tiền tệ VNĐ) → 1 hàm thuần
   trong lib/domain-utils.ts dùng chung, không viết lại logic tính toán rải rác trong
   từng feature component.
```

## 4. Coding principles

**Tooling (dùng chung root, không lặp package riêng cho từng app):**
```
Biome (biome.json root)  -- format + lint 1 tool, thay ESLint/Prettier
Husky + lint-staged       -- pre-commit: biome check + type-check trên file staged
TypeScript strict mode    -- bật ở cả 2 app
```

**Naming convention:** file kebab-case (`create-receivable.usecase.ts`), class PascalCase, biến/hàm camelCase, enum UPPER_SNAKE_CASE (khớp giá trị status đã dùng xuyên suốt các spec, vd `PARTIALLY_PAID`).

**Domain-specific rule (bắt buộc review khi code review, không phải gợi ý):**
- Số tiền: kiểu integer đơn vị đồng (không dùng `float`/số thập phân tự do) — tránh sai số cộng dồn khi tính `paidAmount`/`remainingAmount`.
- Mọi thao tác ghi làm thay đổi số tiền/status (allocation, write-off, undo) phải nằm trong 1 DB transaction — đã định nghĩa ở [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md) mục 4.6, spec này chỉ nhắc lại như checklist code review, không định nghĩa lại.
- `paidAmount` trên `Receivable` và `allocatedAmount` trên `Payment` là persisted rollup để reporting không phải aggregate toàn bộ allocation. Chúng chỉ được cập nhật trong transaction allocation/undo có row lock và DB check constraint; không có service nào được sửa riêng.
- `remainingAmount`, `unallocatedAmount`, `isDisputed`, `isOverdue` là derived field, tính từ persisted data tại thời điểm query/domain method.

## 5. API conventions (áp dụng cho mọi module BE)

- **Versioning:** một prefix cố định `/api/v1` cho toàn bộ business API (đã chốt ở [IMPLEMENTATION-ORDER.md](../IMPLEMENTATION-ORDER.md) mục 13). MVP không hỗ trợ nhiều version song song; khi cần breaking change, thêm `/api/v2` cho riêng endpoint đó, không bump toàn bộ prefix.
- **Idempotency-Key:** mọi endpoint `POST` tạo mới hoặc chuyển tiền/trạng thái do người dùng bấm từ FE (`POST /receivables`, `POST /payments/:id/allocate`, `POST /invoices/import`, `POST /bank-connections/cas-id/sessions/:id/exchange`...) chấp nhận header `Idempotency-Key` (client tự sinh UUID). BE lưu key theo `(organizationId, endpoint, key)` trong bảng dùng chung `idempotency_keys` (TTL 24h, unique constraint) — request trùng key trả lại response đã lưu, không chạy lại use-case. Không áp dụng cho webhook (đã có `WebhookInbox.providerTransactionId` riêng) hay các `GET`. FE tự sinh key mới mỗi lần user bấm submit (không tái dùng key khi user sửa form và bấm lại).
- **Error envelope:** mọi lỗi (4xx/5xx) trả JSON `{ statusCode, errorCode, message, details? }`. `errorCode` là chuỗi `UPPER_SNAKE_CASE` ổn định để FE switch theo (vd `VALIDATION_ERROR`, `PERMISSION_DENIED`, `TENANT_MISMATCH`, `PLAN_LIMIT_EXCEEDED`, `ALLOCATION_EXCEEDS_REMAINING`, `OPTIMISTIC_LOCK_CONFLICT`); `message` là text hiển thị được (tiếng Việt), không phải để FE parse. Danh sách `errorCode` được định nghĩa dần trong từng spec nghiệp vụ khi phát sinh lỗi domain riêng — spec này chỉ chốt shape chung và naming convention, tránh mỗi module tự bịa format riêng.

## 6. GitHub repo setup

```
Tạo repo mới trên GitHub (owner: user), branch mặc định `main`.
Bảo vệ nhánh `main`: require PR review + passing CI (`turbo run verify`) trước khi merge.
.gitignore: node_modules, dist, .env, .turbo
```

## 7. Ngoài phạm vi

- CI/CD pipeline chi tiết (GitHub Actions workflow YAML cụ thể) — chỉ nêu yêu cầu `turbo run verify` phải pass, chưa viết workflow file ở spec này.
- Component library nội bộ ngoài shadcn/ui, package `eslint-config`/`ui` riêng — thêm khi có app thứ 3 cần dùng lại (xem mục 1).
- Chi tiết Docker Compose/deployment — đã có ở [2026-08-03-deployment-observability-design.md](2026-08-03-deployment-observability-design.md), spec này chỉ định nghĩa cấu trúc source code, không lặp lại phần deploy.

## 8. Câu hỏi mở (không chặn implementation)

- `packages/shared-types` build ra `.d.ts` qua `tsc` riêng hay dùng project reference (`tsconfig.json` `references`) để BE/FE luôn thấy type mới nhất khi dev mà không cần rebuild thủ công?
- Có cần convention riêng cho tên PR/branch (vd `feat/`, `fix/` prefix) hay để tự do vì team quy mô nhỏ?
