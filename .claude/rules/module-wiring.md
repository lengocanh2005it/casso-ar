---
paths:
  - "apps/backend/src/modules/*/*.module.ts"
---

# Module Wiring (`*.module.ts`) Rules

- Thứ tự trong `@Module({...})` nhất quán trên toàn repo — giữ nguyên khi thêm module mới hoặc sửa module có sẵn:
  1. `imports`: `TypeOrmModule.forFeature([...])` trước, rồi đến các module phụ thuộc (`XModule`)
  2. `providers`: DI token bindings (`{ provide: X_REPOSITORY, useClass: TypeOrmXRepository }`) trước, use case (`XUseCase`) sau
  3. `controllers`
  4. `exports`: export DI token + use case cho module khác dùng (không export domain/infrastructure internals)
- DI token luôn bind bằng `{ provide: SYMBOL, useClass: Concrete }`, KHÔNG dùng `useValue`/`useFactory` trừ khi thực sự cần khởi tạo động (ví dụ đọc `process.env` — xem `JwtModule.register` trong `auth.module.ts`).
- Module phụ thuộc module khác thì import nguyên `XModule` (không import lẻ provider) — xem `receivables.module.ts` import `CustomersModule`/`BillingModule`.
- Nếu module cần dùng port/entity ở `common/` (ví dụ `AUDIT_LOG_REPOSITORY`), bind trực tiếp trong `providers` của module đó — xem `payments.module.ts`.
