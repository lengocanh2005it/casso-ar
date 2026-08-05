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

1. Money: integer VND units, NEVER use float/decimal
2. Transactions: every write that changes an amount/status MUST be inside one DB transaction
3. Persisted rollup: `paidAmount` and `allocatedAmount` are updated only inside a transaction with a lock
4. Derived fields: `remainingAmount`, `unallocatedAmount`, `isOverdue` — calculate at query time, DO NOT store
5. Tenant isolation: scope every query/write by `organizationId`
6. The domain layer MUST NOT import NestJS/TypeORM
7. Use the `node:` protocol for Node.js builtins (`import { randomUUID } from 'node:crypto'`)
8. Use interfaces for data-only types and classes for types with behavior
9. DO NOT use `any` in production code
10. **MUST** update `docs/wayfinder/feature-map.md` when completing a task (change status → `done`, add `Shipped:` + PR ref)
