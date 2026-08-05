---
paths:
  - "apps/backend/src/**/application/**"
---

# Application Layer Rules

- Use case chỉ phụ thuộc port (`I<Entity>Repository`, `I<Thing>`) và domain.
- KHÔNG import SDK/thư viện tích hợp cụ thể (`@nestjs/jwt`, `@nestjs/passport`,
  `resend`, Cas ID client...) — định nghĩa port riêng, implement adapter ở
  `infrastructure/`. Xem `ITokenSigner` (`modules/auth/application/token-signer.port.ts`)
  làm ví dụ.
- KHÔNG throw `HttpException`, `NotFoundException`, `UnauthorizedException`,
  `BadRequestException`, `ConflictException`, `ForbiddenException`, hay bất kỳ
  exception class nào từ `@nestjs/common` — throw `AppError(errorCode, message, details?)`
  (`common/errors/app-error.ts`). `HttpExceptionFilter` (presentation) là nơi
  duy nhất dịch lỗi sang HTTP status.
- ĐƯỢC PHÉP (không phải vi phạm, không "sửa" các chỗ này):
  - `@Injectable()`/`@Inject()` từ `@nestjs/common` — decorator DI thuần, không
    mang logic nghiệp vụ.
  - `DataSource`/`EntityManager` từ `typeorm` khi cần mở transaction xuyên
    nhiều repository trong 1 use case (xem AGENTS.md).
  - `bcryptjs` — thuật toán băm thuần, không cần DI/config, cùng loại với
    `node:crypto`.
- File: `*.usecase.ts` cho use case, `*-repository.port.ts` / `*-<thing>.port.ts`
  cho port. DI token: `Symbol('X_REPOSITORY')` / `Symbol('X')`.
