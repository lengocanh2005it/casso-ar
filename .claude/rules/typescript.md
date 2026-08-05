---
paths:
  - "apps/backend/src/**"
---

# TypeScript Import Rules

- `import type` for pure types (interfaces, unions, enums used only as types).
- **Value import** (never `import type`) for classes used in constructor
  parameters, decorators, or DTO metatypes — NestJS DI and ValidationPipe resolve
  them at runtime via `emitDecoratorMetadata`'s `design:paramtypes`, and type-only
  imports erase to `Function`/`Object`, silently breaking DI and validation.
- The `useImportType` lint rule is disabled repo-wide (see `biome.jsonc`); the
  convention is enforced by review, not by the linter.
