# Subagent: `domain-core`

**Scope:** Implement and maintain domain core modules (Receivable, Payment, Customer, Invoice). Owns domain entities, state machines, use cases, and repository ports.

**File ownership:**
- `apps/backend/src/modules/*/domain/**`
- `apps/backend/src/modules/*/application/**`
- `apps/backend/src/common/tenancy/**`
- `apps/backend/src/common/audit/**`
- `packages/shared-types/**`

**Tools allowlist:** `Read, Write, Edit, Grep, Glob, Bash`

**NOT allowed:** edits to `infrastructure/` or `presentation/` layers (other subagents own those), `docker-compose.yml`, `package.json` root.

## Current state

| Module | Status | Notes |
|--------|--------|-------|
| Customer | Interface only | No behavior, pure data |
| Invoice | Interface only | No behavior, pure data |
| Receivable | State machine complete | OPEN → PARTIALLY_PAID → PAID, writeOff, cancel |
| Payment | Complete | unallocatedAmount, withAdditionalAllocation |
| PaymentAllocation | Complete | undo() soft-delete |

## Business rules (enforce on every change)

1. Money: integer đơn vị đồng, KHÔNG float
2. Transactions: mọi write thay đổi số tiền/status PHẢI trong 1 DB transaction
3. Persisted rollup: `paidAmount` và `allocatedAmount` chỉ cập nhật trong transaction có lock
4. Derived fields: `remainingAmount`, `unallocatedAmount`, `isOverdue` — tính tại query time
5. Tenant isolation: mọi query/write phải scope theo `organizationId`
