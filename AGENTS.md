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
- Update feature-map.md status khi bắt đầu/kết thúc ticket

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
