---
paths:
  - "apps/backend/src/**/domain/**"
---

# Domain Layer Rules

- NO imports from NestJS or TypeORM
- Money fields: integer đồng, never float
- State transitions must validate before mutating
- Derived fields (remainingAmount, isOverdue) computed at query time, not stored
