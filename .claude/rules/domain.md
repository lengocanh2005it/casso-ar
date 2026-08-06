---
paths:
  - "apps/backend/src/**/domain/**"
---

# Domain Layer Rules

- NO imports from NestJS or TypeORM
- Money fields: integer VND units, never float/decimal
- State transitions must validate before mutating
- Derived fields (`remainingAmount`, `isOverdue`) computed at query time, not stored
- Entities persisted with `@VersionColumn()` carry the `version` field so the repository can save it back (optimistic locking)
- Use `node:` protocol for Node.js builtins (`import { randomUUID } from 'node:crypto'`)
- Interface for data-only types, class for types with behavior
- DO NOT use `any` in production code
- MUST NOT import from application/, infrastructure/, or presentation/ — domain is the core and may depend only on itself
