# Swagger/OpenAPI Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `@nestjs/swagger` + CLI plugin into the backend, protect the docs with Basic Auth in production, and fully document two template modules (`receivables`, `payments`) so every future endpoint follows the same pattern.

**Architecture:** `@nestjs/swagger@11` serves its own Swagger UI (`swagger-ui-dist` is a bundled dependency — no `swagger-ui-express` needed). The CLI plugin (enabled in `nest-cli.json`) auto-generates property metadata for **classes** in `.dto.ts`/`.entity.ts` files — response DTOs in the template modules are converted from `interface` to `class` so the plugin can document them. A shared `@ApiErrorResponse(...errorCodes)` decorator renders the standard `{ statusCode, errorCode, message, details? }` envelope from the existing `STATUS_BY_ERROR_CODE` map (extracted from `HttpExceptionFilter` — single source of truth). Docs live at `/api/docs`: open in dev/test, HTTP Basic Auth (`express-basic-auth`, `SWAGGER_USER`/`SWAGGER_PASSWORD`) when `NODE_ENV=production`. A new arch-check script fails the build when any controller lacks `@ApiTags`.

**Tech Stack:** `@nestjs/swagger@^11` (NestJS 11), `express-basic-auth` + `@types/express-basic-auth`, existing `@nestjs/common`, `@nestjs/config` (ConfigService), `@swc/jest` e2e, testcontainers Postgres.

**Spec:** GitHub issue #139 (lengocanh2005it/casso-ledger) — "Add Swagger/OpenAPI docs for the backend API". Decisions locked in the grilling session: incremental scope (tooling + `receivables`/`payments` templates, backfill via umbrella ticket); Basic Auth for prod; `main.ts` wiring via `setupSwagger(app, config)`; CLI plugin for property metadata; shared error decorator; AGENTS.md + arch-check enforcement; `@ApiOkResponse`+`@ApiProduces` for export endpoints.

## Global Constraints

- Money fields stay integers (VND) — no float/decimal anywhere; docs never change domain logic.
- No new packages beyond `@nestjs/swagger`, `express-basic-auth`, `@types/express-basic-auth` (verify with `npm info` before adding).
- Every write that changes amounts/status stays in a transaction — this ticket touches only `presentation/` + tooling, never `application/`/`domain/`.
- Tenant isolation untouched — docs are read-only tooling; no queries are added or changed.
- Controllers keep zero business logic — only additive metadata decorators.
- No `any` in production code; strict TS.
- Response DTOs for the two template modules become `class` (plugin requirement) — all other modules keep `interface` until backfill.
- e2e uses `@swc/jest` which does **not** run the CLI plugin — e2e assertions cover only runtime decorators (routes, tags, error responses), never plugin-generated property schemas.
- New files kebab-case; classes PascalCase; constants UPPER_SNAKE_CASE.
- Every task ends with a commit; message format `<type>: <description>` from AGENTS.md.

---

### Task 1: Install `@nestjs/swagger` + enable the CLI plugin

**Files:**
- Modify: `apps/backend/package.json` (dependency)
- Modify: `apps/backend/nest-cli.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `nest build` emits plugin-generated swagger metadata for classes in `*.dto.ts`/`*.entity.ts` files (used by Tasks 5–6); `@nestjs/swagger` importable from package root.

- [ ] **Step 1: Verify package freshness**

Run:
```bash
npm info @nestjs/swagger@latest version && npm info express-basic-auth@latest version
```
Expected: `@nestjs/swagger` latest is `11.x` (Nest 11 line), `express-basic-auth` latest is `1.x`. If a version breaks Nest 11 compatibility, stop and re-grill.

- [ ] **Step 2: Install dependencies**

Run (from repo root):
```bash
pnpm --filter @casso-ledger/backend add @nestjs/swagger express-basic-auth
pnpm --filter @casso-ledger/backend add -D @types/express-basic-auth
```
Expected: both land in `apps/backend/package.json` dependencies/devDependencies. Do **not** install `swagger-ui-express` — `@nestjs/swagger@11` bundles `swagger-ui-dist` and serves the UI itself.

- [ ] **Step 3: Enable the CLI plugin**

Replace the contents of `apps/backend/nest-cli.json` with:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "plugins": ["@nestjs/swagger"]
  }
}
```

- [ ] **Step 4: Verify the build still passes with the plugin enabled**

Run:
```bash
cd apps/backend
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
npx nest build
npx tsc --noEmit
```
Expected: both exit 0. The plugin is compile-time only — no runtime behavior changes yet.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/package.json apps/backend/pnpm-lock.yaml apps/backend/nest-cli.json
git commit -m "chore: add @nestjs/swagger and enable CLI plugin"
```

---

### Task 2: Extract the shared `STATUS_BY_ERROR_CODE` map

**Files:**
- Create: `apps/backend/src/common/errors/status-by-error-code.ts`
- Modify: `apps/backend/src/common/errors/http-exception.filter.ts`
- Test: `apps/backend/src/common/errors/status-by-error-code.spec.ts` (new), `apps/backend/src/common/errors/http-exception.filter.spec.ts` (existing, must stay green)

**Interfaces:**
- Consumes: `ErrorCode` from `./error-code`.
- Produces: `STATUS_BY_ERROR_CODE: Readonly<Partial<Record<ErrorCode, number>>>` — imported by `HttpExceptionFilter` (Task 2) and `@ApiErrorResponse` (Task 4).

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/common/errors/status-by-error-code.spec.ts`:

```typescript
import { ErrorCode } from './error-code';
import { STATUS_BY_ERROR_CODE } from './status-by-error-code';

describe('STATUS_BY_ERROR_CODE', () => {
  it('maps every documented ErrorCode to its AGENTS.md HTTP status', () => {
    expect(STATUS_BY_ERROR_CODE[ErrorCode.VALIDATION_ERROR]).toBe(400);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.NOT_FOUND]).toBe(404);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.UNAUTHORIZED]).toBe(401);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.FORBIDDEN]).toBe(403);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.CONFLICT]).toBe(409);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.PLAN_LIMIT_EXCEEDED]).toBe(402);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.TENANT_MISMATCH]).toBe(403);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.ALLOCATION_EXCEEDS_REMAINING]).toBe(400);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.ALLOCATION_EXCEEDS_UNALLOCATED]).toBe(400);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.OPTIMISTIC_LOCK_CONFLICT]).toBe(409);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.PAYMENT_CUSTOMER_UNRESOLVED]).toBe(400);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.CUSTOMER_MISMATCH]).toBe(400);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.RECEIVABLE_NOT_FOUND]).toBe(404);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.PAYMENT_NOT_FOUND]).toBe(404);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.ALLOCATION_NOT_FOUND]).toBe(404);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.ALLOCATION_ALREADY_UNDONE]).toBe(409);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.DISPUTE_ALREADY_OPEN]).toBe(409);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.RECEIVABLE_HAS_PAYMENTS]).toBe(400);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.TEMPLATE_IN_USE]).toBe(409);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.EMAIL_SEND_FAILED]).toBe(500);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.SMTP_CONNECTION_FAILED]).toBe(400);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.IDEMPOTENCY_KEY_REUSED]).toBe(409);
    expect(STATUS_BY_ERROR_CODE[ErrorCode.INVALID_PLAN_TRANSITION]).toBe(400);
  });

  it('falls back to undefined for codes without a documented status', () => {
    expect(STATUS_BY_ERROR_CODE[ErrorCode.INTERNAL_SERVER_ERROR]).toBeUndefined();
    expect(STATUS_BY_ERROR_CODE[ErrorCode.TOKEN_ENCRYPTION_FAILED]).toBeUndefined();
    expect(STATUS_BY_ERROR_CODE[ErrorCode.RATE_LIMIT_EXCEEDED]).toBeUndefined();
    expect(STATUS_BY_ERROR_CODE[ErrorCode.FILE_TOO_LARGE]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern status-by-error-code`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the map**

Create `apps/backend/src/common/errors/status-by-error-code.ts`:

```typescript
import { ErrorCode } from './error-code';

/**
 * Kept in sync with the "API Error Codes" table in AGENTS.md. Every ErrorCode
 * with a documented HTTP status there must have an entry here; codes with no
 * documented status may rely on the `?? 500` fallback at use sites.
 */
export const STATUS_BY_ERROR_CODE: Readonly<
  Partial<Record<ErrorCode, number>>
> = {
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.FILE_TOO_LARGE]: 413,
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
  [ErrorCode.TENANT_MISMATCH]: 403,
  [ErrorCode.PLAN_LIMIT_EXCEEDED]: 402,
  [ErrorCode.ALLOCATION_EXCEEDS_REMAINING]: 400,
  [ErrorCode.ALLOCATION_EXCEEDS_UNALLOCATED]: 400,
  [ErrorCode.OPTIMISTIC_LOCK_CONFLICT]: 409,
  [ErrorCode.PAYMENT_CUSTOMER_UNRESOLVED]: 400,
  [ErrorCode.CUSTOMER_MISMATCH]: 400,
  [ErrorCode.RECEIVABLE_NOT_FOUND]: 404,
  [ErrorCode.PAYMENT_NOT_FOUND]: 404,
  [ErrorCode.ALLOCATION_NOT_FOUND]: 404,
  [ErrorCode.ALLOCATION_ALREADY_UNDONE]: 409,
  [ErrorCode.DISPUTE_ALREADY_OPEN]: 409,
  [ErrorCode.RECEIVABLE_HAS_PAYMENTS]: 400,
  [ErrorCode.TEMPLATE_IN_USE]: 409,
  [ErrorCode.EMAIL_SEND_FAILED]: 500,
  [ErrorCode.SMTP_CONNECTION_FAILED]: 400,
  [ErrorCode.IDEMPOTENCY_KEY_REUSED]: 409,
  [ErrorCode.INVALID_PLAN_TRANSITION]: 400,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern status-by-error-code`
Expected: PASS (2 tests).

- [ ] **Step 5: Refactor `HttpExceptionFilter` to consume the shared map**

In `apps/backend/src/common/errors/http-exception.filter.ts`:
- Add `import { STATUS_BY_ERROR_CODE } from './status-by-error-code';`
- Delete the entire `statusForErrorCode` method (lines ~88–122, the `statusByErrorCode` map and its doc comment).
- Replace the call site `this.statusForErrorCode(exception.errorCode)` with `STATUS_BY_ERROR_CODE[exception.errorCode] ?? 500`.

- [ ] **Step 6: Run the filter regression tests**

Run: `npx jest --testPathPattern http-exception.filter`
Expected: PASS — behavior is byte-identical to before (the map content was copied verbatim).

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/common/errors
git commit -m "refactor: extract shared STATUS_BY_ERROR_CODE map"
```

---

### Task 3: Swagger config + `setupSwagger` + `main.ts` wiring

**Files:**
- Create: `apps/backend/src/common/swagger/swagger.config.ts`
- Test: `apps/backend/src/common/swagger/swagger.config.spec.ts`
- Create: `apps/backend/src/common/swagger/setup-swagger.ts`
- Modify: `apps/backend/src/main.ts`
- Modify: `apps/backend/.env.example`

**Interfaces:**
- Consumes: `ConfigService` from `@nestjs/config` (module is `isGlobal: true`); Task 1 packages.
- Produces:
  - `shouldProtectSwagger(nodeEnv: string | undefined): boolean` — `true` iff `nodeEnv === 'production'`.
  - `getSwaggerBasicAuthUsers(config: ConfigService): { user: string; password: string }` — throws when `SWAGGER_USER`/`SWAGGER_PASSWORD` missing or empty.
  - `SWAGGER_PATH = '/api/docs'` (exported const).
  - `setupSwagger(app: INestApplication, config: ConfigService): void` — mounts Basic Auth in prod, then `SwaggerModule.setup(SWAGGER_PATH, ...)`.

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/src/common/swagger/swagger.config.spec.ts`:

```typescript
import {
  getSwaggerBasicAuthUsers,
  shouldProtectSwagger,
} from './swagger.config';

describe('shouldProtectSwagger', () => {
  it('protects the docs only in production', () => {
    expect(shouldProtectSwagger('production')).toBe(true);
    expect(shouldProtectSwagger('development')).toBe(false);
    expect(shouldProtectSwagger('test')).toBe(false);
    expect(shouldProtectSwagger(undefined)).toBe(false);
  });
});

describe('getSwaggerBasicAuthUsers', () => {
  function buildConfig(values: Record<string, string>) {
    return {
      getOrThrow: jest.fn((key: string) => {
        if (values[key] === undefined) {
          throw new Error(`Missing required env var ${key}`);
        }
        return values[key];
      }),
    };
  }

  it('reads the credentials from ConfigService', () => {
    const config = buildConfig({
      SWAGGER_USER: 'docs-admin',
      SWAGGER_PASSWORD: 's3cret',
    });

    expect(getSwaggerBasicAuthUsers(config as never)).toEqual({
      user: 'docs-admin',
      password: 's3cret',
    });
  });

  it('fails fast when either credential is missing', () => {
    expect(() =>
      getSwaggerBasicAuthUsers(buildConfig({ SWAGGER_USER: 'admin' }) as never),
    ).toThrow(/SWAGGER_PASSWORD/);
  });

  it('fails fast on empty credentials', () => {
    const config = buildConfig({
      SWAGGER_USER: '',
      SWAGGER_PASSWORD: 'x',
    });

    expect(() => getSwaggerBasicAuthUsers(config as never)).toThrow(
      /must not be empty/,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern swagger.config`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the config**

Create `apps/backend/src/common/swagger/swagger.config.ts`:

```typescript
import type { ConfigService } from '@nestjs/config';

export function shouldProtectSwagger(nodeEnv: string | undefined): boolean {
  return nodeEnv === 'production';
}

export function getSwaggerBasicAuthUsers(config: ConfigService): {
  user: string;
  password: string;
} {
  const user = config.getOrThrow<string>('SWAGGER_USER');
  const password = config.getOrThrow<string>('SWAGGER_PASSWORD');
  if (user.trim() === '' || password.trim() === '') {
    throw new Error('SWAGGER_USER and SWAGGER_PASSWORD must not be empty');
  }
  return { user, password };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern swagger.config`
Expected: PASS (5 tests).

- [ ] **Step 5: Implement `setupSwagger`**

Create `apps/backend/src/common/swagger/setup-swagger.ts`:

```typescript
import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import expressBasicAuth from 'express-basic-auth';
import {
  getSwaggerBasicAuthUsers,
  shouldProtectSwagger,
} from './swagger.config';

export const SWAGGER_PATH = '/api/docs';

export function setupSwagger(
  app: INestApplication,
  config: ConfigService,
): void {
  if (shouldProtectSwagger(config.get<string>('NODE_ENV', 'development'))) {
    const { user, password } = getSwaggerBasicAuthUsers(config);
    // Path-prefix mount: protects both /api/docs and /api/docs-json.
    // express-basic-auth compares credentials in constant time.
    app.use(
      SWAGGER_PATH,
      expressBasicAuth({ challenge: true, users: { [user]: password } }),
    );
  }

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Casso Ledger API')
      .setDescription(
        'Casso Ledger backend REST API. ' +
          'All errors share the envelope { statusCode, errorCode, message, details? } — ' +
          'see AGENTS.md "API Error Codes" for the full list.',
      )
      .setVersion('1.0.0')
      .build(),
  );
  SwaggerModule.setup(SWAGGER_PATH, app, document);
}
```

- [ ] **Step 6: Wire into `main.ts`**

Edit `apps/backend/src/main.ts` to:

```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { JsonLogger } from './common/observability/json-logger.service';
import { setupSwagger } from './common/swagger/setup-swagger';
import { configureApp } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(JsonLogger));
  app.use(helmet());
  app.use(cookieParser());
  configureApp(app);
  setupSwagger(app, app.get(ConfigService));
  await app.listen(3000);
}
bootstrap();
```

Note: `ConfigModule.forRoot({ isGlobal: true })` is registered in `AppModule`, so `app.get(ConfigService)` resolves.

- [ ] **Step 7: Document the env vars**

Append to `apps/backend/.env.example`:

```
# Swagger docs (required only when NODE_ENV=production — dev/test serve docs open)
SWAGGER_USER=admin
SWAGGER_PASSWORD=change-me
```

- [ ] **Step 8: Verify in dev (docs open, no auth)**

Run:
```bash
cd apps/backend
npx tsc --noEmit
npx nest start &
Start-Sleep -Seconds 8
(Invoke-WebRequest http://localhost:3000/api/docs-json -UseBasicParsing).StatusCode
(Invoke-WebRequest http://localhost:3000/api/docs -UseBasicParsing).StatusCode
```
Expected: both return `200` and no `WWW-Authenticate` header. Then stop the dev server.

- [ ] **Step 9: Verify prod gate logic without deploying**

Run: `npx jest --testPathPattern swagger.config`
Expected: PASS — the `shouldProtectSwagger('production') === true` case is the prod gate (the middleware itself is exercised in Task 9's e2e for the open path; prod is env-gated by `NODE_ENV` only).

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/common/swagger apps/backend/src/main.ts apps/backend/.env.example
git commit -m "feat: serve Swagger docs at /api/docs with Basic Auth in production"
```

---

### Task 4: Shared `@ApiErrorResponse` decorator

**Files:**
- Create: `apps/backend/src/common/swagger/api-error-response.decorator.ts`
- Test: `apps/backend/src/common/swagger/api-error-response.decorator.spec.ts`

**Interfaces:**
- Consumes: `ErrorCode` (`./error-code`), `STATUS_BY_ERROR_CODE` (`./status-by-error-code`), `ApiResponse`/`ApiOkResponse`/`ApiCreatedResponse` types from `@nestjs/swagger`.
- Produces:
  - `errorResponseSchema(errorCode: ErrorCode)` — the `{ statusCode, errorCode, message, details? }` schema object (used in tests and by the decorator).
  - `ApiErrorResponse(...errorCodes: ErrorCode[]): MethodDecorator` — one `@ApiResponse` per unique HTTP status (first code wins on status collision); attaches via `applyDecorators`.

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/src/common/swagger/api-error-response.decorator.spec.ts`:

```typescript
import { ErrorCode } from '../errors/error-code';
import {
  ApiErrorResponse,
  errorResponseSchema,
} from './api-error-response.decorator';

describe('errorResponseSchema', () => {
  it('builds the standard error envelope for an error code', () => {
    const schema = errorResponseSchema(ErrorCode.RECEIVABLE_NOT_FOUND);

    expect(schema).toEqual({
      type: 'object',
      required: ['statusCode', 'errorCode', 'message'],
      properties: {
        statusCode: { type: 'number', example: 404 },
        errorCode: { type: 'string', example: ErrorCode.RECEIVABLE_NOT_FOUND },
        message: { type: 'string' },
        details: {},
      },
    });
  });
});

describe('ApiErrorResponse', () => {
  it('attaches one @ApiResponse per unique HTTP status', () => {
    class TestController {
      @ApiErrorResponse(
        ErrorCode.NOT_FOUND,
        ErrorCode.VALIDATION_ERROR,
        ErrorCode.RECEIVABLE_NOT_FOUND,
      )
      run() {}
    }

    const responses = Reflect.getMetadata(
      'swagger/apiResponse',
      TestController.prototype,
      'run',
    );

    expect(Object.keys(responses).sort()).toEqual(['400', '404']);
    expect(responses['400'].schema.properties.errorCode.example).toBe(
      ErrorCode.VALIDATION_ERROR,
    );
    expect(responses['404'].schema.properties.errorCode.example).toBe(
      ErrorCode.RECEIVABLE_NOT_FOUND,
    );
  });

  it('supports zero error codes (no-op)', () => {
    class TestController {
      @ApiErrorResponse()
      run() {}
    }

    const responses = Reflect.getMetadata(
      'swagger/apiResponse',
      TestController.prototype,
      'run',
    );
    expect(responses).toBeUndefined();
  });
});
```

Note: `'swagger/apiResponse'` is the metadata key `@nestjs/swagger` uses for `@ApiResponse` — the decorator under test must write to it.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern api-error-response`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the decorator**

Create `apps/backend/src/common/swagger/api-error-response.decorator.ts`:

```typescript
import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorCode } from '../errors/error-code';
import { STATUS_BY_ERROR_CODE } from '../errors/status-by-error-code';

export function errorResponseSchema(errorCode: ErrorCode) {
  return {
    type: 'object' as const,
    required: ['statusCode', 'errorCode', 'message'],
    properties: {
      statusCode: { type: 'number' as const, example: STATUS_BY_ERROR_CODE[errorCode] ?? 500 },
      errorCode: { type: 'string' as const, example: errorCode },
      message: { type: 'string' as const },
      details: {},
    },
  };
}

export function ApiErrorResponse(...errorCodes: ErrorCode[]): MethodDecorator {
  const statusFor = (code: ErrorCode): number =>
    STATUS_BY_ERROR_CODE[code] ?? 500;
  const deduped = [
    ...new Map(errorCodes.map((code) => [statusFor(code), code])).values(),
  ];

  return applyDecorators(
    ...deduped.map((code) =>
      ApiResponse({
        status: statusFor(code),
        description: code,
        schema: errorResponseSchema(code),
      }),
    ),
  );
}
```

The plain object literal is structurally compatible with `@nestjs/swagger`'s `SchemaObject` — no internal type import needed (`SchemaObject` is not exported from the package root).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern api-error-response`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/common/swagger
git commit -m "feat: add shared @ApiErrorResponse decorator for the error envelope"
```

---

### Task 5: Template module — `receivables` (DTOs + controller annotations)

**Files:**
- Modify: `apps/backend/src/modules/receivables/presentation/dto/receivable-response.dto.ts`
- Modify: `apps/backend/src/modules/receivables/presentation/dto/receivable-summary-response.dto.ts`
- Create: `apps/backend/src/modules/receivables/presentation/dto/list-receivables-response.dto.ts`
- Modify: `apps/backend/src/modules/receivables/presentation/receivables.controller.ts`

**Interfaces:**
- Consumes: Task 4 `ApiErrorResponse`, `ErrorCode`; `@nestjs/swagger` decorators; plugin (Task 1).
- Produces (all referenced by Task 9's e2e assertions and by later backfill tasks as the canonical template):
  - `ReceivableResponseDto`, `ReceivableDetailResponseDto`, `PaymentAllocationResponseDto`, `ReceivableSummaryResponseDto` — now **classes** (plugin-documented).
  - `ListReceivablesResponseDto` — class wrapping `{ items, total, page, limit }`.
  - Controller endpoints tagged `receivables`, each with `@ApiOperation`, response decorators, `@ApiErrorResponse`, and `@ApiProduces`/`@ApiHeader` where relevant.

- [ ] **Step 1: Convert response DTOs from interfaces to classes**

In `apps/backend/src/modules/receivables/presentation/dto/receivable-response.dto.ts`, change `interface` to `class` for `PaymentAllocationResponseDto`, `ReceivableResponseDto`, `ReceivableDetailResponseDto`, and the internal `AllocationSource`/`ReceivableResponseSource` stay as interfaces (they are not HTTP payloads — leave them `interface`). `extends` works identically. Final file:

```typescript
import type { ReceivableStatus } from '@casso-ledger/shared-types';

export class PaymentAllocationResponseDto {
  id: string;
  paymentId: string;
  allocatedAmount: number;
  allocatedAt: Date;
  allocatedByUserId: string | null;
}

export class ReceivableResponseDto {
  id: string;
  customerId: string;
  invoiceId: string | null;
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate: Date;
  status: ReceivableStatus;
  salesRepresentativeId: string | null;
  createdAt: Date;
  closedAt: Date | null;
}

export class ReceivableDetailResponseDto extends ReceivableResponseDto {
  invoiceNumber: string | null;
  isOverdue: boolean;
  isDisputed: boolean;
  disputeId: string | null;
  allocations: PaymentAllocationResponseDto[];
}

interface AllocationSource {
  id: string;
  paymentId: string;
  allocatedAmount: number;
  allocatedAt: Date;
  allocatedByUserId: string | null;
}

interface ReceivableResponseSource {
  id: string;
  customerId: string;
  invoiceId: string | null;
  originalAmount: number;
  paidAmount: number;
  dueDate: Date;
  status: ReceivableStatus;
  salesRepresentativeId: string | null;
  createdAt: Date;
  closedAt: Date | null;
}

export function toReceivableResponse(
  r: ReceivableResponseSource,
): ReceivableResponseDto {
  return {
    id: r.id,
    customerId: r.customerId,
    invoiceId: r.invoiceId,
    originalAmount: r.originalAmount,
    paidAmount: r.paidAmount,
    remainingAmount: r.originalAmount - r.paidAmount,
    dueDate: r.dueDate,
    status: r.status,
    salesRepresentativeId: r.salesRepresentativeId,
    createdAt: r.createdAt,
    closedAt: r.closedAt,
  };
}

export function toReceivableDetailResponse(
  r: ReceivableResponseSource,
  isDisputed: boolean,
  disputeId: string | null,
  allocations: AllocationSource[],
  invoiceNumber: string | null,
  isOverdue: boolean,
): ReceivableDetailResponseDto {
  return {
    ...toReceivableResponse(r),
    invoiceNumber,
    isOverdue,
    isDisputed,
    disputeId,
    allocations: allocations.map((a) => ({
      id: a.id,
      paymentId: a.paymentId,
      allocatedAmount: a.allocatedAmount,
      allocatedAt: a.allocatedAt,
      allocatedByUserId: a.allocatedByUserId,
    })),
  };
}
```

In `apps/backend/src/modules/receivables/presentation/dto/receivable-summary-response.dto.ts`, change `export interface ReceivableSummaryResponseDto` to `export class ReceivableSummaryResponseDto` (leave `ReceivableSource` as interface):

```typescript
export class ReceivableSummaryResponseDto {
  id: string;
  customerId: string;
  customerName: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate: Date;
  status: ReceivableStatus;
  isOverdue: boolean;
  isDisputed: boolean;
  disputeId: string | null;
  salesRepresentativeId: string | null;
  createdAt: Date;
}
```

Create `apps/backend/src/modules/receivables/presentation/dto/list-receivables-response.dto.ts`:

```typescript
import { ReceivableSummaryResponseDto } from './receivable-summary-response.dto';

export class ListReceivablesResponseDto {
  items: ReceivableSummaryResponseDto[];
  total: number;
  page: number;
  limit: number;
}
```

- [ ] **Step 2: Run existing tests to verify the conversion is behavior-neutral**

Run: `npx jest --testPathPattern receivables`
Expected: PASS — mapper functions are unchanged; `class` is a valid return type for the interfaces' former shape.

- [ ] **Step 3: Annotate the controller**

In `apps/backend/src/modules/receivables/presentation/receivables.controller.ts`, apply the following additions (imports first):

```typescript
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { ErrorCode } from '../../../common/errors/error-code';
import { ListReceivablesResponseDto } from './dto/list-receivables-response.dto';
```

Class level (above `@UseGuards(PermissionGuard)`):

```typescript
@ApiTags('receivables')
```

Endpoint by endpoint:

```typescript
@Get('export')
@ApiOperation({ summary: 'Export receivables as CSV' })
@ApiProduces('text/csv')
@ApiOkResponse({
  description:
    'CSV download; may be truncated — X-Export-Truncated: true header signals truncation',
})
@ApiErrorResponse(ErrorCode.VALIDATION_ERROR)
@RequirePermission(Permission.RECEIVABLE_READ)
```

```typescript
@Get()
@ApiOperation({ summary: 'List receivables with pagination and filters' })
@ApiOkResponse({ type: ListReceivablesResponseDto })
@ApiErrorResponse(ErrorCode.VALIDATION_ERROR)
@RequirePermission(Permission.RECEIVABLE_READ)
```

```typescript
@Post()
@ApiOperation({ summary: 'Create a receivable' })
@ApiHeader({ name: 'idempotency-key', required: false })
@ApiCreatedResponse({ type: ReceivableResponseDto })
@ApiErrorResponse(
  ErrorCode.VALIDATION_ERROR,
  ErrorCode.NOT_FOUND,
  ErrorCode.PLAN_LIMIT_EXCEEDED,
  ErrorCode.IDEMPOTENCY_KEY_REUSED,
)
@RequirePermission(Permission.RECEIVABLE_WRITE)
```

(add `ApiCreatedResponse` to the swagger imports; `ReceivableResponseDto` is already imported)

```typescript
@Get(':id')
@ApiOperation({ summary: 'Get a receivable by id' })
@ApiOkResponse({ type: ReceivableDetailResponseDto })
@ApiErrorResponse(ErrorCode.RECEIVABLE_NOT_FOUND)
@RequirePermission(Permission.RECEIVABLE_READ)
```

```typescript
@Post(':id/write-off')
@ApiOperation({ summary: 'Write off a receivable' })
@ApiHeader({ name: 'idempotency-key', required: false })
@ApiCreatedResponse({ type: ReceivableResponseDto })
@ApiErrorResponse(ErrorCode.RECEIVABLE_NOT_FOUND, ErrorCode.IDEMPOTENCY_KEY_REUSED)
@RequirePermission(Permission.RECEIVABLE_WRITE_OFF)
```

```typescript
@Post(':id/cancel')
@ApiOperation({ summary: 'Cancel a receivable' })
@ApiHeader({ name: 'idempotency-key', required: false })
@ApiCreatedResponse({ type: ReceivableResponseDto })
@ApiErrorResponse(
  ErrorCode.RECEIVABLE_NOT_FOUND,
  ErrorCode.RECEIVABLE_HAS_PAYMENTS,
  ErrorCode.CONFLICT,
  ErrorCode.IDEMPOTENCY_KEY_REUSED,
)
@RequirePermission(Permission.RECEIVABLE_WRITE_OFF)
```

- [ ] **Step 4: Type-check**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: PASS. If `ApiCreatedResponse` is missing from the import list, add it.

- [ ] **Step 5: Verify the plugin-generated schemas in a real document**

Run:
```bash
cd apps/backend
npx nest start &
Start-Sleep -Seconds 10
$doc = (Invoke-WebRequest http://localhost:3000/api/docs-json -UseBasicParsing).Content | ConvertFrom-Json
$doc.components.schemas.PSObject.Properties.Name
```
Expected (this is the plugin's proof point — classes in `.dto.ts` files get schemas):
`CreateReceivableDto`, `ListReceivablesQueryDto`, `ReceivableResponseDto`, `ReceivableDetailResponseDto`, `ReceivableSummaryResponseDto`, `ListReceivablesResponseDto`, `PaymentAllocationResponseDto` are all present. Also verify:
```powershell
$doc.paths.'/api/v1/receivables/{id}'.get.responses.'404'.schema.properties.errorCode.example
```
Expected: `RECEIVABLE_NOT_FOUND`.

If any schema is missing, the file suffix or class keyword is wrong — every documented payload file must end in `.dto.ts` and declare `class`. Stop the dev server when done.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/receivables/presentation
git commit -m "docs: annotate receivables module for OpenAPI"
```

---

### Task 6: Template module — `payments` (controller annotations)

**Files:**
- Modify: `apps/backend/src/modules/payments/presentation/payments.controller.ts`

**Interfaces:**
- Consumes: Task 4 `ApiErrorResponse`, `ErrorCode`; `@nestjs/swagger` decorators.
- Produces: `payments`-tagged endpoints with `@ApiOperation`, `@ApiCreatedResponse` (inline success schema — the endpoints return `{ success: true }`, no DTO class needed), `@ApiErrorResponse` per use-case throws (verified below), `@ApiHeader('idempotency-key')`.

- [ ] **Step 1: Write the failing test first (decorator presence is metadata — assert via the e2e contract instead)**

There is no unit-level assertion for decorator presence; the contract is verified end-to-end in Task 9. Instead, this task's test gate is the existing unit suite staying green after annotation. Run now to record the baseline:

Run: `npx jest --testPathPattern payments`
Expected: PASS.

- [ ] **Step 2: Annotate the controller**

In `apps/backend/src/modules/payments/presentation/payments.controller.ts`:

```typescript
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { ErrorCode } from '../../../common/errors/error-code';
```

Class level (above `@Controller('payments')`):

```typescript
@ApiTags('payments')
```

```typescript
@Post(':id/allocate')
@ApiOperation({ summary: 'Allocate a payment to a receivable' })
@ApiHeader({ name: 'idempotency-key', required: false })
@ApiCreatedResponse({
  description: 'Allocation succeeded',
  schema: {
    type: 'object',
    properties: { success: { type: 'boolean', example: true } },
  },
})
@ApiErrorResponse(
  ErrorCode.VALIDATION_ERROR,
  ErrorCode.PAYMENT_NOT_FOUND,
  ErrorCode.RECEIVABLE_NOT_FOUND,
  ErrorCode.PAYMENT_CUSTOMER_UNRESOLVED,
  ErrorCode.CUSTOMER_MISMATCH,
  ErrorCode.ALLOCATION_EXCEEDS_REMAINING,
  ErrorCode.ALLOCATION_EXCEEDS_UNALLOCATED,
  ErrorCode.CONFLICT,
  ErrorCode.IDEMPOTENCY_KEY_REUSED,
)
@UseGuards(PermissionGuard)
@RequirePermission(Permission.PAYMENT_ALLOCATE)
```

```typescript
@Post('allocations/:allocationId/undo')
@ApiOperation({ summary: 'Undo a payment allocation' })
@ApiHeader({ name: 'idempotency-key', required: false })
@ApiCreatedResponse({
  description: 'Allocation undone',
  schema: {
    type: 'object',
    properties: { success: { type: 'boolean', example: true } },
  },
})
@ApiErrorResponse(
  ErrorCode.VALIDATION_ERROR,
  ErrorCode.ALLOCATION_NOT_FOUND,
  ErrorCode.ALLOCATION_ALREADY_UNDONE,
  ErrorCode.PAYMENT_NOT_FOUND,
  ErrorCode.RECEIVABLE_NOT_FOUND,
  ErrorCode.IDEMPOTENCY_KEY_REUSED,
)
@UseGuards(PermissionGuard)
@RequirePermission(Permission.PAYMENT_ALLOCATE_UNDO)
```

Error codes above were read from `allocate-payment.usecase.ts` (VALIDATION_ERROR, RECEIVABLE_NOT_FOUND, PAYMENT_NOT_FOUND, PAYMENT_CUSTOMER_UNRESOLVED, CUSTOMER_MISMATCH, ALLOCATION_EXCEEDS_REMAINING, CONFLICT, ALLOCATION_EXCEEDS_UNALLOCATED) and `undo-payment-allocation.usecase.ts` (ALLOCATION_NOT_FOUND, ALLOCATION_ALREADY_UNDONE, PAYMENT_NOT_FOUND, RECEIVABLE_NOT_FOUND); `IDEMPOTENCY_KEY_REUSED` comes from the `IdempotencyService` wrap both endpoints run under.

- [ ] **Step 3: Type-check and test**

Run:
```bash
cd apps/backend
npx tsc --noEmit
npx jest --testPathPattern payments
```
Expected: both PASS.

- [ ] **Step 4: Verify the document**

Run:
```bash
cd apps/backend
npx nest start &
Start-Sleep -Seconds 10
$doc = (Invoke-WebRequest http://localhost:3000/api/docs-json -UseBasicParsing).Content | ConvertFrom-Json
$doc.paths.'/api/v1/payments/{id}/allocate'.post.responses.'201'
$doc.paths.'/api/v1/payments/allocations/{allocationId}/undo'.post.responses.'404'.schema.properties.errorCode.example
```
Expected: 201 response present; the undo endpoint's 404 schema shows `ALLOCATION_NOT_FOUND` (first 404 code listed). Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/payments/presentation
git commit -m "docs: annotate payments module for OpenAPI"
```

---

### Task 7: Baseline — `@ApiTags` on every remaining controller

**Files:** (modify each — add the class-level `@ApiTags('<tag>')` decorator and the import)

| File | Tag |
|------|-----|
| `src/modules/billing/presentation/billing.controller.ts` | `billing` |
| `src/modules/auth/presentation/auth.controller.ts` | `auth` |
| `src/modules/auth/presentation/invites.controller.ts` | `auth-invites` |
| `src/modules/webhooks/presentation/webhooks.controller.ts` | `webhooks` |
| `src/modules/webhooks/presentation/webhook-inbox.controller.ts` | `webhooks-inbox` |
| `src/modules/payos/presentation/payos.controller.ts` | `payos` |
| `src/modules/audit-logs/presentation/audit-logs.controller.ts` | `audit-logs` |
| `src/modules/email-templates/presentation/email-templates.controller.ts` | `email-templates` |
| `src/modules/bank-connections/presentation/bank-connections.controller.ts` | `bank-connections` |
| `src/modules/bank-accounts/presentation/customer-bank-accounts.controller.ts` | `customer-bank-accounts` |
| `src/modules/alerts/presentation/alerts.controller.ts` | `alerts` |
| `src/modules/disputes/presentation/disputes.controller.ts` | `disputes` |
| `src/modules/payments/presentation/customer-credits.controller.ts` | `customer-credits` |
| `src/modules/exception-queue/presentation/exception-queue.controller.ts` | `exception-queue` |
| `src/modules/invoice-import/presentation/invoice-import.controller.ts` | `invoice-import` |
| `src/modules/customers/presentation/customers.controller.ts` | `customers` |
| `src/modules/smtp-config/presentation/smtp-config.controller.ts` | `smtp-config` |
| `src/modules/internal-tasks/presentation/internal-tasks.controller.ts` | `internal-tasks` |
| `src/modules/collection-activity/presentation/collection-activity.controller.ts` | `collection-activity` |
| `src/modules/organizations/presentation/organizations.controller.ts` | `organizations` |
| `src/modules/reporting/presentation/reports.controller.ts` | `reports` |
| `src/modules/reminders/presentation/reminders.controller.ts` | `reminders` |
| `src/modules/copilot/presentation/copilot.controller.ts` | `copilot` |
| `src/common/observability/health.controller.ts` | `health` |

For each file, add:

```typescript
import { ApiTags } from '@nestjs/swagger';
```

and the class-level decorator directly above `@Controller(...)`:

```typescript
@ApiTags('<tag>')
```

For `health.controller.ts` additionally annotate the handler (it returns a plain object via `@Res()` — explicit schema instead of a class):

```typescript
@Get()
@ApiOperation({ summary: 'Health check (Postgres, Redis, BullMQ)' })
@ApiOkResponse({
  description: 'ok or degraded with per-check booleans',
  schema: {
    type: 'object',
    properties: {
      status: { type: 'string', example: 'ok' },
      checks: {
        type: 'object',
        properties: {
          postgres: { type: 'boolean', example: true },
          redis: { type: 'boolean', example: true },
          bullmq: { type: 'boolean', example: true },
        },
      },
    },
  },
})
async handle(@Res() res: Response): Promise<void> {
```

**Interfaces:**
- Consumes: nothing beyond `@nestjs/swagger`.
- Produces: every controller in the repo carries `@ApiTags` — the precondition for Task 8's arch-check script to pass repo-wide.

- [ ] **Step 1: Apply the table above** — one file at a time, `@ApiTags('<tag>')` + import. Health gets the extra handler annotation from the snippet above.

- [ ] **Step 2: Type-check and run the controller-related suites**

Run:
```bash
cd apps/backend
npx tsc --noEmit
npx jest
```
Expected: PASS.

- [ ] **Step 3: Verify tags appear in the document**

Run (dev server):
```bash
cd apps/backend
npx nest start &
Start-Sleep -Seconds 10
$doc = (Invoke-WebRequest http://localhost:3000/api/docs-json -UseBasicParsing).Content | ConvertFrom-Json
$doc.tags.PSObject.Properties.Name
```
Expected: tags list contains every tag from the table. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src
git commit -m "docs: add @ApiTags baseline to all controllers"
```

---

### Task 8: Arch-check script — controllers must have `@ApiTags`

**Files:**
- Create: `apps/backend/scripts/check-controller-docs.mjs`
- Create: `apps/backend/scripts/check-controller-docs.test.mjs`
- Modify: `apps/backend/package.json` (arch-check script)

**Interfaces:**
- Consumes: file layout of `src/modules` + `src/common` (mirrors `check-application-exceptions.mjs`).
- Produces: `findControllerDocsViolations(sourceRoot: string): string[]` (exported, unit-tested) + CLI entry that exits 1 on violations.

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/scripts/check-controller-docs.test.mjs`, mirroring the fixture pattern of `check-cross-module-infrastructure.test.mjs`:

```javascript
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { findControllerDocsViolations } from './check-controller-docs.mjs';

function createFixture(files) {
  const sourceRoot = join(mkdtempSync(join(tmpdir(), 'controller-docs-')), 'src');
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(sourceRoot, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
  return sourceRoot;
}

test('flags controllers without @ApiTags', (t) => {
  const sourceRoot = createFixture({
    'modules/customers/presentation/customers.controller.ts':
      "import { Controller, Get } from '@nestjs/common';\n@Controller('customers')\nexport class CustomersController {}\n",
    'modules/receivables/presentation/receivables.controller.ts':
      "import { ApiTags } from '@nestjs/swagger';\nimport { Controller } from '@nestjs/common';\n@ApiTags('receivables')\n@Controller('receivables')\nexport class ReceivablesController {}\n",
  });
  t.after(() => rmSync(sourceRoot, { recursive: true, force: true }));

  assert.deepEqual(findControllerDocsViolations(sourceRoot), [
    join(sourceRoot, 'modules/customers/presentation/customers.controller.ts'),
  ]);
});

test('ignores spec files and non-controller files', (t) => {
  const sourceRoot = createFixture({
    'modules/customers/presentation/customers.controller.spec.ts':
      "import { Controller } from '@nestjs/common';\n",
    'modules/customers/presentation/customers.controller.ts':
      "import { ApiTags } from '@nestjs/swagger';\nimport { Controller } from '@nestjs/common';\n@ApiTags('customers')\n@Controller('customers')\nexport class CustomersController {}\n",
    'modules/customers/application/create-customer.usecase.ts':
      "import { Controller } from '@nestjs/common';\n",
  });
  t.after(() => rmSync(sourceRoot, { recursive: true, force: true }));

  assert.deepEqual(findControllerDocsViolations(sourceRoot), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && node --test scripts/check-controller-docs.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the script**

Create `apps/backend/scripts/check-controller-docs.mjs`:

```javascript
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const API_TAGS_IMPORT = /import\s*\{[^}]*ApiTags[^}]*\}\s*from\s*['"]@nestjs\/swagger['"]/;
const API_TAGS_DECORATOR = /@ApiTags\(\s*['"][^'"]+['"]\s*\)/;

function collectTsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectTsFiles(full));
    } else if (
      full.endsWith('.controller.ts') &&
      !full.endsWith('.spec.ts')
    ) {
      files.push(full);
    }
  }
  return files;
}

export function findControllerDocsViolations(sourceRoot) {
  const violations = [];
  for (const root of ['modules', 'common']) {
    const base = join(sourceRoot, root);
    if (!statSync(base).isDirectory()) continue;
    for (const file of collectTsFiles(base)) {
      const content = readFileSync(file, 'utf8');
      if (
        !API_TAGS_IMPORT.test(content) ||
        !API_TAGS_DECORATOR.test(content)
      ) {
        violations.push(file);
      }
    }
  }
  return violations;
}

const isCli =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  const violations = findControllerDocsViolations(join(process.cwd(), 'src'));
  if (violations.length > 0) {
    console.error('Controllers without @ApiTags found:\n');
    for (const violation of violations) {
      console.error(`  ${violation}`);
    }
    console.error(
      '\nEvery controller must carry @ApiTags("<tag>") so the API docs stay complete.',
    );
    process.exit(1);
  }
  console.log('Controller docs check passed.');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && node --test scripts/check-controller-docs.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire into `arch-check`**

In `apps/backend/package.json`, extend the `arch-check` script:

```json
"arch-check": "depcruise --config .dependency-cruiser.cjs src && node scripts/check-application-exceptions.mjs && node --test scripts/check-cross-module-infrastructure.test.mjs && node scripts/check-cross-module-infrastructure.mjs && node scripts/check-controller-docs.mjs && node --test scripts/check-controller-docs.test.mjs"
```

- [ ] **Step 6: Run the full arch-check**

Run: `cd apps/backend && pnpm run arch-check`
Expected: PASS — all controllers now carry `@ApiTags` (Task 7), including the new script's own pass line.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/scripts apps/backend/package.json
git commit -m "chore: arch-check requires @ApiTags on every controller"
```

---

### Task 9: e2e — Swagger document contract test

**Files:**
- Create: `apps/backend/test/swagger-docs.e2e-spec.ts`

**Interfaces:**
- Consumes: Tasks 3, 5, 6 (routes, tags, error responses, `SWAGGER_PATH`), existing e2e bootstrap pattern (`ops-apis.e2e-spec.ts`).
- Produces: the regression net for the docs contract: UI served, OpenAPI 3 doc, prefix-bearing paths, template tags, standard error envelope, and no auth in non-production.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/test/swagger-docs.e2e-spec.ts`:

```typescript
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SWAGGER_PATH } from '../src/common/swagger/setup-swagger';
import { configureApp } from '../src/configure-app';
import { WEBHOOK_JOB_QUEUE } from '../src/modules/webhooks/application/webhook-job-queue.port';

describe('Swagger / OpenAPI docs (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.JWT_SECRET = 'swagger-e2e-jwt-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'swagger-e2e-resend-key';
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'e2e-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'e2e-secret';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideModule(TypeOrmModule)
      .useModule(
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: container.getHost(),
          port: container.getMappedPort(5432),
          username: container.getUsername(),
          password: container.getPassword(),
          database: container.getDatabase(),
          autoLoadEntities: true,
          synchronize: true,
          retryAttempts: 0,
        }),
      )
      .overrideProvider(WEBHOOK_JOB_QUEUE)
      .useValue({ enqueue: jest.fn() })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('serves the Swagger UI at /api/docs', async () => {
    const res = await request(app.getHttpServer())
      .get(SWAGGER_PATH)
      .expect(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });

  it('serves an OpenAPI 3 document with prefixed paths', async () => {
    const res = await request(app.getHttpServer())
      .get(`${SWAGGER_PATH}-json`)
      .expect(200);

    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.info.title).toBe('Casso Ledger API');
    expect(res.body.paths['/api/v1/receivables']).toBeDefined();
    expect(res.body.paths['/api/v1/receivables/{id}']).toBeDefined();
    expect(res.body.paths['/api/v1/payments/{id}/allocate']).toBeDefined();
    expect(res.body.paths['/api/v1/payments/allocations/{allocationId}/undo']).toBeDefined();
    expect(res.body.paths['/api/v1/health']).toBeDefined();
  });

  it('groups template controllers under ApiTags', async () => {
    const res = await request(app.getHttpServer())
      .get(`${SWAGGER_PATH}-json`)
      .expect(200);

    const tags = res.body.tags.map((t: { name: string }) => t.name);
    expect(tags).toEqual(expect.arrayContaining(['receivables', 'payments']));
  });

  it('documents the standard error envelope on template endpoints', async () => {
    const res = await request(app.getHttpServer())
      .get(`${SWAGGER_PATH}-json`)
      .expect(200);

    const getById = res.body.paths['/api/v1/receivables/{id}'].get;
    const notFound = getById.responses['404'];
    expect(notFound.schema.properties.errorCode.example).toBe(
      'RECEIVABLE_NOT_FOUND',
    );
    expect(notFound.schema.required).toEqual(
      expect.arrayContaining(['statusCode', 'errorCode', 'message']),
    );

    const undo = res.body.paths['/api/v1/payments/allocations/{allocationId}/undo'].post;
    expect(undo.responses['404']).toBeDefined();
    expect(undo.responses['409']).toBeDefined();
    expect(undo.responses['201']).toBeDefined();
  });

  it('serves docs without authentication in non-production environments', async () => {
    const res = await request(app.getHttpServer())
      .get(`${SWAGGER_PATH}-json`)
      .expect(200);
    expect(res.headers['www-authenticate']).toBeUndefined();
  });
});
```

Note: `@swc/jest` does not run the CLI plugin, so this suite asserts only runtime-decorator output (routes, tags, error responses, info block) — property-level schemas are covered by Task 5 Step 5's manual verification and remain plugin-generated in real `nest build`/`nest start` runs.

- [ ] **Step 2: Run the test to verify it fails for the right reason**

Run: `cd apps/backend && npx jest --config ./test/jest-e2e.json --testPathPattern swagger-docs`
Expected: FAIL — the current document has no tags/error responses (endpoints exist; assertions on tags/envelope fail). Requires local Docker (testcontainers) + Redis on `localhost:6379`, matching the other e2e suites.

- [ ] **Step 3: Implement — this task's code is the test file itself; the app code it asserts against shipped in Tasks 3, 5, 6, 7.**

Re-run after Tasks 5–7 if they were not yet complete.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/backend && npx jest --config ./test/jest-e2e.json --testPathPattern swagger-docs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/test/swagger-docs.e2e-spec.ts
git commit -m "test: e2e contract test for Swagger document and error envelope"
```

---

### Task 10: Docs + backfill umbrella ticket

**Files:**
- Modify: `AGENTS.md` (repo root)
- (GitHub) Create: umbrella backfill issue

**Interfaces:**
- Consumes: everything above (the pattern the backfill will copy).
- Produces: the documented rule "new endpoints must be documented" + a tracked follow-up.

- [ ] **Step 1: Update `AGENTS.md`**

In the `### NestJS` section, add:

```markdown
### API Docs (Swagger)

- Every controller MUST carry `@ApiTags('<tag>')` — enforced by `scripts/check-controller-docs.mjs` in `pnpm verify` (arch-check)
- New endpoints MUST add `@ApiOperation(...)` + response decorators (`@ApiOkResponse`/`@ApiCreatedResponse`) and list their error codes via `@ApiErrorResponse(ErrorCode.X)` from `src/common/swagger/api-error-response.decorator.ts`
- HTTP status ↔ ErrorCode mapping lives in ONE place: `src/common/errors/status-by-error-code.ts` (consumed by `HttpExceptionFilter` and the docs decorator) — update it when adding a code
- Response DTOs exposed over HTTP MUST be `class` (not `interface`) so the swagger CLI plugin (see `nest-cli.json`) documents them; files must end in `.dto.ts`
- Docs UI: `/api/docs` (OpenAPI JSON at `/api/docs-json`) — open in dev/test, HTTP Basic Auth via `SWAGGER_USER`/`SWAGGER_PASSWORD` in production
- File-download endpoints (CSV export) use `@ApiProduces(<mime>)` + `@ApiOkResponse` with a description
```

- [ ] **Step 2: Create the backfill umbrella issue**

Use `gh issue create` (owner `lengocanh2005it`, repo `casso-ledger`):

```bash
gh issue create \
  --title "docs: backfill OpenAPI annotations for remaining modules (template: #139)" \
  --label "wayfinder:task" \
  --body "Part of #17. Backfill after #139 shipped the pattern on \`receivables\` + \`payments\`.

For each module below, copy the template from the receivables controller (\`@ApiTags\` done; add \`@ApiOperation\`, response decorators, \`@ApiErrorResponse\` per use-case throws, \`@ApiProduces\` for exports, \`@ApiHeader('idempotency-key')\` where wrapped). Convert HTTP-facing response DTOs from \`interface\` to \`class\` (plugin requirement).

Controllers:
- [ ] billing
- [ ] auth, auth-invites
- [ ] webhooks, webhooks-inbox
- [ ] payos
- [ ] audit-logs
- [ ] email-templates
- [ ] bank-connections
- [ ] customer-bank-accounts
- [ ] alerts
- [ ] disputes
- [ ] customer-credits
- [ ] exception-queue
- [ ] invoice-import
- [ ] customers
- [ ] smtp-config
- [ ] internal-tasks
- [ ] collection-activity
- [ ] organizations
- [ ] reports
- [ ] reminders
- [ ] copilot

Acceptance: \`pnpm verify\` green; \`GET /api/docs-json\` shows every endpoint with error responses."
```

- [ ] **Step 3: Update the plan reference in `docs/wayfinder/feature-map.md`** — only if #139 is listed there (grep first). If absent, skip; the plan file itself is the record.

- [ ] **Step 4: Final verification — full gate**

Run (from repo root, worktree `feat-api-docs`):
```bash
pnpm verify
```
Expected: lint, type-check, unit tests, arch-check all pass.

Also confirm the dev-server document still renders (spot check after any last edits):
```bash
cd apps/backend
npx nest start &
Start-Sleep -Seconds 10
(Invoke-WebRequest http://localhost:3000/api/docs -UseBasicParsing).StatusCode
```
Expected: 200. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs: AGENTS.md API docs rules for Swagger"
```

---

## Self-Review

- **Spec coverage:** #139's requirements — install packages (Task 1), wire `SwaggerModule` at `/api/docs` (Task 3), prod auth decided as Basic Auth (Tasks 3), DTO annotation via plugin + `@ApiTags`/`@ApiOperation`/`@ApiResponse` incl. error envelope (Tasks 2, 4–7), scope = incremental with template modules + backfill ticket (Tasks 5, 6, 10) — all present.
- **Placeholder scan:** no TBD/TODO; every code step carries real code. The one contingency (Task 5 Step 5 "missing schema") names the exact cause and fix.
- **Type consistency:** `SWAGGER_PATH` defined in Task 3, consumed in Task 9; `STATUS_BY_ERROR_CODE` defined in Task 2, consumed in Tasks 2 and 4; `errorResponseSchema`/`ApiErrorResponse` defined in Task 4, consumed in Tasks 5–6 and 10; class DTO names consistent between Tasks 5 and 9.
- **Known constraint surfaced:** e2e (`@swc/jest`) never sees plugin metadata — property-schema verification is manual (Task 5 Step 5); e2e asserts runtime decorators only. If the team later wants property assertions in CI, the SWC path requires `SwaggerModule.loadPluginMetadata` with a generated metadata file — explicitly out of scope here.

## Execution Deviations (2026-08-14)

Recorded while executing this plan; the shipped code is the source of truth where it differs:

1. **`@types/express-basic-auth` does not exist on npm** — `express-basic-auth@1.2.1` ships its own `express-basic-auth.d.ts` (`users`/`challenge`/`safeCompare` covered). Nothing extra to install.
2. **`tsconfig.build.json` (new) + Dockerfile CMD change** — the plugin's generated deep-imports (`require('../../../../../../../packages/shared-types/dist/plan-id')`) were off by one because `nest build` emitted `dist/src/...` while the plugin computes paths from `src/...`. Added the standard NestJS `tsconfig.build.json` (`include: ["src"]`, `rootDir: "src"` — explicit `rootDir` required by TS 6) so `dist/` mirrors `src/`; Dockerfile CMD updated to `apps/backend/dist/main.js`. Without this the app crashes at boot with MODULE_NOT_FOUND on every enum-typed DTO.
3. **`@ApiProduces` corrupts error responses** — with `@ApiProduces('text/csv')` the 400 error response rendered as `content: text/csv`. Replaced with explicit `@ApiOkResponse({ content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } } })`. Same guidance recorded in AGENTS.md.
4. **`@Type(() => Number)` query params rendered as `$ref Object`** by the plugin — fixed with explicit `@ApiProperty({ type: Number, ... })` on `ListReceivablesQueryDto.page/limit` (and same pattern for any future query DTO).
5. **Top-level OpenAPI `tags` array stays empty** — `@ApiTags` populates operation-level tags only (Swagger UI still groups correctly); e2e asserts operation tags, not the top-level array.
6. **`pnpm-workspace.yaml`** — fixed the invalid `'@scarf/scarf': set this to true or false` placeholder (caused `ERR_PNPM_IGNORED_BUILDS`, exit 1, on every fresh-worktree install).
7. **E2e must call `setupSwagger()` itself** — `main.ts` wiring is not visible to e2e bootstraps; `swagger-docs.e2e-spec.ts` mirrors `main.ts` (`configureApp` + `setupSwagger`). Also added `jest.setTimeout(60_000)` per repo convention (`alerts.e2e-spec.ts`).
8. **Schema assertions read `content['application/json'].schema`** — the envelope schema nests under `content`, not at response top level.
