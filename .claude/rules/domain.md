---
paths:
  - "apps/backend/src/**/domain/**"
---

# Domain Layer Rules

- NO imports from NestJS or TypeORM
- Money fields: integer đồng, never float/decimal
- State transitions must validate before mutating
- Derived fields (`remainingAmount`, `isOverdue`) computed at query time, not stored
- Use `node:` protocol for Node.js builtins (`import { randomUUID } from 'node:crypto'`)
- Interface for data-only types, class for types with behavior
- KHÔNG dùng `any` trong production code
- KHÔNG import từ application/, infrastructure/, hay presentation/ — domain là lõi, chỉ được phụ thuộc chính nó
