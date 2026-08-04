# AGENTS.MD

File này định nghĩa coding rules và conventions cho TẤT CẢ agent (Claude Code, GitHub Copilot, Cursor, etc.) làm việc trong repo này. Mọi agent PHẢI tuân thủ.

---

## Architecture

### Clean Architecture (Backend)

Mỗi module NestJS tổ chức theo 4 layers:

```
domain/           Entity, state machine, domain error
                  KHÔNG import NestJS/TypeORM
application/      Use case + port interface (I<Entity>Repository)
infrastructure/   TypeORM repository, adapters
presentation/     Controller, DTO, DI wiring
```

Dependency: `presentation → application → domain`, `infrastructure → application`.

### File naming

- Files: kebab-case (`create-receivable.usecase.ts`)
- Classes: PascalCase (`CreateReceivableUseCase`)
- Variables/functions: camelCase (`receivableRepo`)
- Enums: UPPER_SNAKE_CASE (`PARTIALLY_PAID`)
- Constants: UPPER_SNAKE_CASE (`RECEIVABLE_REPOSITORY`)

---

## Business Rules (CRITICAL)

### Money

- **LUÔN** dùng integer đơn vị đồng (VND)
- **KHÔNG BAO GIỜ** dùng float hoặc decimal cho tiền
- TypeORM: `@Column('bigint')` cho mọi field tiền

```typescript
// ✅ Đúng
@Column('bigint')
amount: number;

// ❌ Sai
@Column('decimal', { precision: 10, scale: 2 })
amount: number;
```

### Transactions

- Mọi write thay đổi số tiền/status PHẢI trong 1 DB transaction
- Dùng `DataSource.transaction()` hoặc `EntityManager` trong use case
- Không bao giờ update rollup fields ngoài transaction

### Persisted Rollup

- `Receivable.paidAmount` và `Payment.allocatedAmount` là persisted rollup
- Chỉ cập nhật trong transaction có lock (pessimistic_write)
- Không dùng `SUM(PaymentAllocation)` runtime

### Derived Fields

- `remainingAmount`, `unallocatedAmount`, `isOverdue`, `isDisputed` — tính tại query time
- KHÔNG store derived fields trong database

### Tenant Isolation

- Mọi query/write PHẢI scope theo `organizationId`
- Dùng `TenantContextService.getOrganizationId()`
- Không bao giờ hardcode organizationId

```typescript
// ✅ Đúng
const orgId = this.tenantContext.getOrganizationId();
await this.repo.findOne({ where: { id, organizationId: orgId } });

// ❌ Sai
await this.repo.findOne({ where: { id } }); // thiếu organizationId
```

---

## Code Style

### TypeScript

- Strict mode enabled
- Không dùng `any` trong production code (test được phép)
- Dùng `node:` protocol cho Node.js builtins (`import { randomUUID } from 'node:crypto'`)
- Interface cho data-only types, class cho types có behavior

### NestJS

- Use case trong `application/`, KHÔNG đặt trong controller
- Controller chỉ gọi use case, không chứa business logic
- Dùng Symbol cho DI tokens (`export const X_REPOSITORY = Symbol('X_REPOSITORY')`)
- Global prefix: `/api/v1`

### TypeORM

- Entity class tên `XOrmEntity` (infrastructure layer)
- Domain entity KHÔNG import TypeORM decorators
- Dùng `@VersionColumn()` cho optimistic locking
- Dùng `EntityManager` parameter cho transactional saves

### Validation

- Dùng class-validator decorators trên DTOs
- Response DTOs: không leak `organizationId`, `version`, internal fields
- Error shape: `{ statusCode, errorCode, message, details? }`

---

## Testing

### Unit tests

- File: `*.spec.ts` đặt cùng thư mục với source
- Mock repositories với `jest.fn()`
- Test domain logic thuần, không cần NestJS container

### Integration tests

- File: `*.e2e-spec.ts` trong `test/` directory
- Dùng `@nestjs/testing` cho module setup
- Dùng testcontainers cho real Postgres

### Test commands

```bash
npx jest                          # Run all unit tests
npx jest --testPathPattern <name> # Run specific test
npx tsc --noEmit                  # Type check
```

---

## Git Conventions

### Commit messages

```
<type>: <description>

Types: feat, fix, chore, refactor, test, docs
```

Examples:
- `feat: add Receivable module with state machine`
- `fix: TenantContextService throw on missing org ID`
- `chore: upgrade NestJS to v11`
- `refactor: Customer class → interface`

### Branches

- `main` — production-ready code
- `feat/<name>` — new features
- `fix/<name>` — bug fixes
- `chore/<name>` — maintenance

### Workflow: Bắt đầu ticket mới

**BẮT BUỘC** khi bắt đầu implement một ticket từ `docs/wayfinder/feature-map.md`:

1. **Tạo worktree** trong `.worktrees/`:
```bash
git worktree add .worktrees/feat/<ticket-name> -b feat/<ticket-name>
```

2. **Làm việc trên worktree** đó, KHÔNG làm trên `main`

3. **Khi hoàn thành**:
```bash
cd .worktrees/feat/<ticket-name>
git add -A
git commit -m "feat: <mô tả>"
git push -u origin feat/<ticket-name>
gh pr create --title "feat: <mô tả>" --body "Closes #<issue>"
```

4. **Chờ user review** trước khi merge

5. **Dọn dẹp** sau khi merge:
```bash
git worktree remove .worktrees/feat/<ticket-name>
git branch -d feat/<ticket-name>
```

**LƯU Ý:**
- Mỗi ticket = 1 worktree riêng
- Không bao giờ code trực tiếp trên `main`
- PR phải có test pass + type check pass
- **BẮT BUỘC** cập nhật `docs/wayfinder/feature-map.md` khi:
  - Bắt đầu ticket: đổi status → `in-progress`
  - Hoàn thành ticket: đổi status → `done`, thêm `Shipped:` date + PR reference
  - Blocker thay đổi: cập nhật `Blockers` field
  - Frontier thay đổi: cập nhật section `Frontier`

---

## Security

### Secrets & Credentials

- **KHÔNG BAO GIỜ** commit secrets, API keys, passwords, tokens
- Dùng environment variables cho mọi secrets
- `.env` đã có trong `.gitignore` — KHÔNG force add
- JWT secret: `process.env.JWT_SECRET` (required, không có default)
- Cas ID credentials: `process.env.CAS_ID_CLIENT_ID`, `process.env.CAS_ID_CLIENT_SECRET`
- Database: `process.env.DB_PASSWORD` (không default)

### Authentication

- Access token: 15 phút,httpOnly cookie
- Refresh token: 7 ngày, httpOnly cookie, secure
- Rate limit: 5 req/phút per (IP, email) cho auth endpoints
- Token hash: SHA-256 khi lưu数据库, không plaintext

### Authorization

- Mọi endpoint business PHẢI có `@RequirePermission()` decorator
- Check permission TRƯỚC khi execute use case
- Response không leak `organizationId`, `version`, internal fields
- Webhook auth: constant-time compare (không dùng `===`)

---

## Error Handling

### Error Response Shape

Mọi lỗi trả về dạng chuẩn:

```typescript
{
  statusCode: number,      // HTTP status code
  errorCode: string,       // UPPER_SNAKE_CASE, stable cho FE switch
  message: string,         // Human-readable (tiếng Việt)
  details?: unknown        // Optional additional info
}
```

### ErrorCode Constants

```typescript
enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  CONFLICT = 'CONFLICT',
  PLAN_LIMIT_EXCEEDED = 'PLAN_LIMIT_EXCEEDED',
  ALLOCATION_EXCEEDS_REMAINING = 'ALLOCATION_EXCEEDS_REMAINING',
  ALLOCATION_EXCEEDS_UNALLOCATED = 'ALLOCATION_EXCEEDS_UNALLOCATED',
  OPTIMISTIC_LOCK_CONFLICT = 'OPTIMISTIC_LOCK_CONFLICT',
  TENANT_MISMATCH = 'TENANT_MISMATCH',
  PAYMENT_CUSTOMER_UNRESOLVED = 'PAYMENT_CUSTOMER_UNRESOLVED',
  CUSTOMER_MISMATCH = 'CUSTOMER_MISMATCH',
  RECEIVABLE_NOT_FOUND = 'RECEIVABLE_NOT_FOUND',
  PAYMENT_NOT_FOUND = 'PAYMENT_NOT_FOUND',
  ALLOCATION_NOT_FOUND = 'ALLOCATION_NOT_FOUND',
  ALLOCATION_ALREADY_UNDONE = 'ALLOCATION_ALREADY_UNDONE',
  DISPUTE_ALREADY_OPEN = 'DISPUTE_ALREADY_OPEN',
  RECEIVABLE_HAS_PAYMENTS = 'RECEIVABLE_HAS_PAYMENTS',
  TEMPLATE_IN_USE = 'TEMPLATE_IN_USE',
  EMAIL_SEND_FAILED = 'EMAIL_SEND_FAILED',
  IDEMPOTENCY_KEY_REUSED = 'IDEMPOTENCY_KEY_REUSED',
}
```

### Domain Errors

- Domain logic throw `Error` với message rõ ràng
- Controller translate domain error → HTTP response + ErrorCode
- Không return `{ success: false }` — luôn throw exception

```typescript
// ✅ Đúng
if (amount > remaining) {
  throw new Error('Allocation amount exceeds remaining amount');
}

// ❌ Sai
return { success: false, error: 'Invalid amount' };
```

---

## Logging

### Console Output

- **KHÔNG** dùng `console.log()` trong production code
- Dùng structured logging qua logger service
- Logger PHẢI có context: `organizationId`, `userId`, `requestId`

```typescript
// ✅ Đúng
this.logger.log({
  message: 'Payment allocated',
  paymentId: payment.id,
  receivableId: receivable.id,
  amount,
  organizationId: this.tenantContext.getOrganizationId(),
});

// ❌ Sai
console.log('Payment allocated:', payment.id);
```

### Log Levels

- `error`: System errors, exceptions
- `warn`: Business rule violations, degraded state
- `info`: Business events (payment allocated, reminder sent)
- `debug`: Development debugging (chỉ dùng khi debug, KHÔNG commit)

---

## Performance

### Database Queries

- **KHÔNG** dùng `SELECT *` — luôn select cụ thể columns
- **KHÔNG** N+1 queries — dùng `IN` hoặc `JOIN` thay vì loop
- Thêm index cho frequently queried columns:
  ```typescript
  @Index(['organizationId', 'status', 'dueDate'])
  ```
- Dùng pagination cho mọi list endpoint (`page`, `limit`)
- `limit` tối đa 100, default 20

### Caching

- Không cache riêng — để TypeORM query cache hoặc Redis handle
- Invalidate cache khi có write operation

### Transaction Scope

- Giữ transaction ngắn nhất có thể
- KHÔNG gọi external API trong transaction
- Lock chỉ giữ trong transaction, không lock ngoài

---

## Dependency Management

### Thêm Package Mới

Trước khi thêm dependency mới:

1. **Kiểm tra** package đã có trong workspace chưa
2. **Kiểm tra** stdlib làm được không
3. **Kiểm tra** package có actively maintained không
4. **Kiểm tra** bundle size có acceptabe không

```bash
# Kiểm tra package
npm info <package> --json | jq '.time.modified, .dist-tags'
```

### Package Categories

| Category | Allowed | Notes |
|----------|---------|-------|
| NestJS modules | `@nestjs/*` | Official NestJS packages |
| TypeORM | `typeorm`, `@nestjs/typeorm` | Database ORM |
| Validation | `class-validator`, `class-transformer` | DTO validation |
| Queue | `bullmq`, `@nestjs/bullmq` | Job queue |
| Email | `resend` | Email provider |
| Testing | `jest`, `supertest`, `@testcontainers/*` | Test tools |
| Utilities | `date-fns`, `zod` | Only if justified |

### KHÔNG thêm

- Lodash (dùng native JS methods)
- Moment.js (dùng date-fns hoặc Intl)
- Axios (dùng native fetch)
- uuid (dùng crypto.randomUUID)

---

## Environment Variables

### Required Variables

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=casso
DB_PASSWORD=casso
DB_DATABASE=casso_ledger

# JWT
JWT_SECRET=your-secret-key-here
JWT_EXPIRATION=15m
REFRESH_EXPIRATION=7d

# Cas ID
CAS_ID_CLIENT_ID=
CAS_ID_CLIENT_SECRET=
CAS_ID_BASE_URL=https://api.cas.so

# Email (Resend)
RESEND_API_KEY=
AUTH_EMAIL_SENDER=noreply@casso.vn

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
```

### Quy tắc

- **KHÔNG** commit `.env` file
- Luôn có `.env.example` với placeholder values
- Validate required vars khi app startup
- Dùng `process.env.VARIABLE ?? 'default'` cho optional vars
- KHÔNG dùng `process.env.VARIABLE!` (non-null assertion)

---

## API Error Codes

### Danh sách errorCode chuẩn

| ErrorCode | HTTP Status | Mô tả |
|-----------|-------------|-------|
| `VALIDATION_ERROR` | 400 | Input validation failed |
| `NOT_FOUND` | 404 | Resource not found |
| `UNAUTHORIZED` | 401 | Missing or invalid auth |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `CONFLICT` | 409 | Resource conflict (duplicate, etc.) |
| `PLAN_LIMIT_EXCEEDED` | 402 | Billing quota exceeded |
| `ALLOCATION_EXCEEDS_REMAINING` | 400 | Allocation > remaining amount |
| `ALLOCATION_EXCEEDS_UNALLOCATED` | 400 | Allocation > unallocated payment |
| `OPTIMISTIC_LOCK_CONFLICT` | 409 | Version mismatch (retry) |
| `TENANT_MISMATCH` | 403 | Cross-tenant access denied |
| `PAYMENT_CUSTOMER_UNRESOLVED` | 400 | Payment has no customer |
| `CUSTOMER_MISMATCH` | 400 | Payment ≠ Receivable customer |
| `RECEIVABLE_NOT_FOUND` | 404 | Receivable not found |
| `PAYMENT_NOT_FOUND` | 404 | Payment not found |
| `ALLOCATION_NOT_FOUND` | 404 | Allocation not found |
| `ALLOCATION_ALREADY_UNDONE` | 409 | Allocation already undone |
| `DISPUTE_ALREADY_OPEN` | 409 | Duplicate open dispute |
| `RECEIVABLE_HAS_PAYMENTS` | 400 | Cannot cancel paid receivable |
| `TEMPLATE_IN_USE` | 409 | Template referenced by rule |
| `EMAIL_SEND_FAILED` | 500 | Email provider error |
| `IDEMPOTENCY_KEY_REUSED` | 409 | Duplicate idempotency key |

### Quy tắc dùng

- `errorCode` là string ổn định, FE switch theo errorCode
- `message` là text hiển thị cho user (tiếng Việt)
- KHÔNG để FE parse message để quyết định logic

---

## Forbidden Patterns

### NEVER

1. Dùng `float` hoặc `decimal` cho tiền
2. Import NestJS/TypeORM trong `domain/` layer
3. Hardcode `organizationId`
4. Update rollup fields ngoài transaction
5. Leak internal fields trong response DTOs
6. Bỏ qua tenant isolation
7. Viết business logic trong controller
8. Dùng `any` trong production code

### ALWAYS

1. Scope query theo `organizationId`
2. Dùng transaction cho write operations
3. Validate input với class-validator
4. Viết test cho use cases mới
5. Update module khi thêm providers/controllers
6. Kiểm tra `organizationId` khi save

---

## File Structure Reference

```
apps/backend/src/
  common/
    tenancy/         TenantContextService, TenantMiddleware
    audit/           AuditLog, AuditEnums
  modules/
    <module>/
      domain/        Entity interfaces/classes
      application/   Use cases, repository ports
      infrastructure/ TypeORM entities, repository implementations
      presentation/  Controllers, DTOs
      <module>.module.ts
  config/
    typeorm.config.ts
  main.ts
  app.module.ts
```

---

## Quick Reference

| Concept | Location |
|---------|----------|
| Domain entities | `*/domain/*.ts` |
| Use cases | `*/application/*.usecase.ts` |
| Repository ports | `*/application/*-repository.port.ts` |
| TypeORM entities | `*/infrastructure/*.orm-entity.ts` |
| Repository implementations | `*/infrastructure/typeorm-*.repository.ts` |
| Controllers | `*/presentation/*.controller.ts` |
| DTOs | `*/presentation/dto/*.dto.ts` |
| Module wiring | `*/*.module.ts` |
| Tests | `*.spec.ts` (unit), `test/*.e2e-spec.ts` (integration) |
