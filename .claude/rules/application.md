---
paths:
  - "apps/backend/src/**/application/**"
---

# Application Layer Rules

- Use cases depend only on ports (`I<Entity>Repository`, `I<Thing>`) and the domain.
- MUST NOT import specific SDKs/integration libraries (`@nestjs/jwt`, `@nestjs/passport`,
  `resend`, Cas ID client...) — define a dedicated port and implement the adapter in
  `infrastructure/`. See `ITokenSigner` (`modules/auth/application/token-signer.port.ts`)
  as an example.
- MUST NOT throw `HttpException`, `NotFoundException`, `UnauthorizedException`,
  `BadRequestException`, `ConflictException`, `ForbiddenException`, or any exception
  class from `@nestjs/common` — throw `AppError(errorCode, message, details?)`
  (`common/errors/app-error.ts`). `HttpExceptionFilter` (presentation) is the sole
  place that translates errors into HTTP status codes.
- ALLOWED (not violations; do not "fix" these locations):
  - `@Injectable()`/`@Inject()` from `@nestjs/common` — inert DI decorators with no
    business logic.
  - `DataSource`/`EntityManager` from `typeorm` when opening a transaction across
    multiple repositories in one use case (see AGENTS.md).
  - `bcryptjs` — a stateless hashing algorithm that needs no DI/config, like
    `node:crypto`.
- Files: `*.usecase.ts` for use cases, `*-repository.port.ts` / `*-<thing>.port.ts`
  for ports. DI tokens: `Symbol('X_REPOSITORY')` / `Symbol('X')`.
