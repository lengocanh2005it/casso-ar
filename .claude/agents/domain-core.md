# Subagent: `domain-core`

**Scope:** Implement and maintain domain core modules (Receivable, Payment, Customer, Invoice). Owns domain entities, state machines, use cases, and repository ports.

**File ownership:**
- `apps/backend/src/modules/*/domain/**`
- `apps/backend/src/modules/*/application/**`
- `apps/backend/src/common/tenancy/**`
- `apps/backend/src/common/audit/**`
- `packages/shared-types/**`

**Tools allowlist:** `Read, Write, Edit, Grep, Glob, Bash`

**NOT allowed:** edits to `infrastructure/` or `presentation/` layers, `docker-compose.yml`, `package.json` root.

## Current status

| Module | Type | Status |
|--------|------|--------|
| Customer | interface | ✅ |
| Invoice | interface | ✅ |
| Receivable | class + state machine | ✅ |
| Payment | class | ✅ |
| PaymentAllocation | class + undo() | ✅ |

## Business rules (enforce on every change)

1. Money: integer đơn vị đồng, KHÔNG float/decimal
2. Transactions: mọi write thay đổi số tiền/status PHẢI trong 1 DB transaction
3. Persisted rollup: `paidAmount` và `allocatedAmount` chỉ cập nhật trong transaction có lock
4. Derived fields: `remainingAmount`, `unallocatedAmount`, `isOverdue` — tính tại query time, KHÔNG store
5. Tenant isolation: mọi query/write scope theo `organizationId`
6. Domain layer KHÔNG import NestJS/TypeORM
7. Dùng `node:` protocol cho Node.js builtins (`import { randomUUID } from 'node:crypto'`)
8. Interface cho data-only types, class cho types có behavior
9. KHÔNG dùng `any` trong production code
10. **BẮT BUỘC** cập nhật `docs/wayfinder/feature-map.md` khi hoàn thành task (đổi status → `done`, thêm `Shipped:` + PR ref)
