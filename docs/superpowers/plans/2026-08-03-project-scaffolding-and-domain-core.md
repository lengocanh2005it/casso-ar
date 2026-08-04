# Project Scaffolding & Domain Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khởi tạo monorepo Casso Ledger (Turborepo + pnpm) với backend NestJS theo Clean Architecture, và implement đầy đủ Domain Core (Customer, Invoice, Receivable, Payment, PaymentAllocation) — entity, state machine, use case, repository, migration, test — chạy được và test pass, KHÔNG bao gồm frontend scaffold (tách plan riêng sau vì domain-core không phụ thuộc UI).

**Architecture:** NestJS modular monolith, mỗi module nghiệp vụ có 4 lớp `domain/application/infrastructure/presentation` (dependency: presentation → application → domain, infrastructure → application). TypeORM cho persistence, Postgres qua Docker Compose cho local dev, testcontainers cho integration test.

**Tech Stack:** pnpm workspaces + Turborepo, NestJS 10, TypeORM 0.3, PostgreSQL 16, Jest + testcontainers + supertest, Biome (lint/format), Husky + lint-staged, TypeScript strict.

## Global Constraints

- `packageManager: "pnpm@10.x"`, `engines.node: ">=20"` (spec mục 1).
- Số tiền: kiểu integer đơn vị đồng, không dùng `float` (spec mục 4).
- Mọi thao tác ghi thay đổi số tiền/status phải nằm trong 1 DB transaction (spec mục 4, domain-core mục 4.6).
- `paidAmount` trên Receivable và `allocatedAmount` trên Payment là persisted rollup; `remainingAmount`, `unallocatedAmount`, `isDisputed`, `isOverdue` là derived field (domain-core mục 3, spec scaffolding mục 4).
- Naming: file kebab-case, class PascalCase, biến/hàm camelCase, enum UPPER_SNAKE_CASE (spec mục 4).
- `domain/` không import bất kỳ gì từ NestJS/TypeORM (spec mục 2).
- Một `Payment` chỉ được allocate khi `Payment.customerId` tồn tại và trùng `Receivable.customerId` (domain-core mục 4.1).
- `allocatedAmount` là số nguyên dương và không được vượt `remainingAmount` tại thời điểm allocate — check + ghi phải cùng transaction có lock (domain-core mục 4.3).
- `PaymentAllocation` chỉ được tính vào rollup khi `deletedAt IS NULL`; undo là soft-delete + audit trong cùng transaction (domain-core mục 4.5-4.7).
- `Receivable.salesRepresentativeId` là ownership scope nullable; Service lọc theo `ctx.userId` khi role là `SALES_REP`.
- `PaymentAllocation` undo phải lock allocation + payment + receivable, giảm cả hai persisted rollup, ghi `AuditLog` INSERT-only với before/after state, rồi mới commit.

---

## File Structure

```
casso-ledger/
  package.json                          -- root workspace scripts
  pnpm-workspace.yaml
  turbo.json
  biome.json
  .gitignore
  .husky/pre-commit
  docker-compose.yml                     -- postgres + redis cho local dev (mở rộng sau ở deployment spec)
  packages/
    shared-types/
      package.json
      src/index.ts
      src/receivable-status.ts
  apps/
    backend/
      package.json
      tsconfig.json
      nest-cli.json
      src/
        main.ts
        app.module.ts
        config/
          typeorm.config.ts
        modules/
          customers/
            domain/customer.ts
            application/customer-repository.port.ts
            infrastructure/customer.orm-entity.ts
            infrastructure/typeorm-customer.repository.ts
            customers.module.ts
          invoices/
            domain/invoice.ts
            application/invoice-repository.port.ts
            infrastructure/invoice.orm-entity.ts
            infrastructure/typeorm-invoice.repository.ts
            invoices.module.ts
          receivables/
            domain/receivable.ts
            domain/receivable-status.ts
            application/receivable-repository.port.ts
            application/create-receivable.usecase.ts
            application/write-off-receivable.usecase.ts
            application/cancel-receivable.usecase.ts
            infrastructure/receivable.orm-entity.ts
            infrastructure/typeorm-receivable.repository.ts
            presentation/receivables.controller.ts
            presentation/dto/create-receivable.dto.ts
            receivables.module.ts
          payments/
            domain/payment.ts
            domain/payment-allocation.ts
            application/payment-repository.port.ts
            application/payment-allocation-repository.port.ts
            application/allocate-payment.usecase.ts
            application/undo-payment-allocation.usecase.ts
            infrastructure/payment.orm-entity.ts
            infrastructure/payment-allocation.orm-entity.ts
            infrastructure/typeorm-payment.repository.ts
            infrastructure/typeorm-payment-allocation.repository.ts
            presentation/payments.controller.ts
            presentation/dto/allocate-payment.dto.ts
            payments.module.ts
      test/
        receivable.domain.spec.ts
        allocate-payment.usecase.spec.ts
        undo-payment-allocation.usecase.spec.ts
        payment-allocation.integration.spec.ts
```

---

### Task 1: Monorepo root scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `biome.json`
- Create: `.gitignore`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: root workspace that `apps/*` and `packages/*` register into; `turbo run <task>` command available to every later task

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "casso-ledger",
  "private": true,
  "packageManager": "pnpm@10.11.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "turbo run build",
    "dev:backend": "turbo run dev --filter=@casso-ledger/backend",
    "dev:frontend": "turbo run dev --filter=@casso-ledger/frontend",
    "lint": "turbo run lint",
    "format": "biome format --write .",
    "test": "turbo run test",
    "type-check": "turbo run type-check",
    "verify": "turbo run lint type-check test"
  },
  "devDependencies": {
    "@biomejs/biome": "1.9.4",
    "husky": "9.1.7",
    "lint-staged": "15.2.10",
    "turbo": "2.3.3",
    "typescript": "5.7.2"
  }
}
```

- [ ] **Step 3: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "type-check": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

- [ ] **Step 4: Create `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  },
  "javascript": {
    "formatter": { "quoteStyle": "single", "semicolons": "always" }
  }
}
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules
dist
.env
.turbo
*.tsbuildinfo
```

- [ ] **Step 6: Verify workspace installs**

Run: `pnpm install`
Expected: completes without error (no apps/packages yet, but pnpm accepts empty workspace globs)

- [ ] **Step 7: Commit**

```bash
git init
git add package.json pnpm-workspace.yaml turbo.json biome.json .gitignore
git commit -m "chore: scaffold monorepo root (pnpm + turborepo + biome)"
```

---

### Task 2: Husky + lint-staged pre-commit hook

**Files:**
- Create: `.husky/pre-commit`
- Modify: `package.json` (add `lint-staged` config)

**Interfaces:**
- Consumes: `biome` from Task 1 devDependencies
- Produces: pre-commit hook blocking commits with lint errors, used by every subsequent commit in this plan

- [ ] **Step 1: Install husky and initialize**

Run: `pnpm dlx husky init`
Expected: creates `.husky/pre-commit` with default `npm test` content and adds `"prepare": "husky"` to `package.json`

- [ ] **Step 2: Replace `.husky/pre-commit` content**

```sh
npx lint-staged
```

- [ ] **Step 3: Add `lint-staged` config to root `package.json`**

```json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx,json}": ["biome check --write --no-errors-on-unmatched"]
  }
}
```

- [ ] **Step 4: Verify hook triggers**

```bash
echo "const x=1" > /tmp/test-lint.ts
cp /tmp/test-lint.ts apps/scratch-lint-test.ts
git add apps/scratch-lint-test.ts
git commit -m "test: verify pre-commit hook"
```
Expected: commit succeeds and `apps/scratch-lint-test.ts` is auto-formatted by biome (check file content changed to have semicolon/spacing fixed)

- [ ] **Step 5: Remove test file and commit real change**

```bash
git rm apps/scratch-lint-test.ts
git add .husky package.json
git commit -m "chore: add husky pre-commit hook with lint-staged"
```

---

### Task 3: `packages/shared-types` package

**Files:**
- Create: `packages/shared-types/package.json`
- Create: `packages/shared-types/tsconfig.json`
- Create: `packages/shared-types/src/index.ts`
- Create: `packages/shared-types/src/receivable-status.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `ReceivableStatus` enum, exported from `@casso-ledger/shared-types`, imported by Task 8 (Receivable domain) and any future frontend code

- [ ] **Step 1: Create `packages/shared-types/package.json`**

```json
{
  "name": "@casso-ledger/shared-types",
  "version": "0.0.1",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "type-check": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "5.7.2"
  }
}
```

- [ ] **Step 2: Create `packages/shared-types/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "declaration": true,
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/shared-types/src/receivable-status.ts`**

```typescript
export enum ReceivableStatus {
  DRAFT = 'DRAFT',
  OPEN = 'OPEN',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  WRITTEN_OFF = 'WRITTEN_OFF',
  CANCELLED = 'CANCELLED',
}
```

- [ ] **Step 4: Create `packages/shared-types/src/index.ts`**

```typescript
export { ReceivableStatus } from './receivable-status';
```

- [ ] **Step 5: Build and verify**

Run: `cd packages/shared-types && pnpm install && pnpm build`
Expected: `dist/index.js` and `dist/index.d.ts` created without errors

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types
git commit -m "feat: add shared-types package with ReceivableStatus enum"
```

---

### Task 4: Backend NestJS app scaffold

**Files:**
- Create: `apps/backend/package.json`
- Create: `apps/backend/tsconfig.json`
- Create: `apps/backend/nest-cli.json`
- Create: `apps/backend/src/main.ts`
- Create: `apps/backend/src/app.module.ts`
- Test: `apps/backend/test/app.e2e-spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: running NestJS app on port 3000, `AppModule` that Task 6+ modules register into via `imports: []`

- [ ] **Step 1: Create `apps/backend/package.json`**

```json
{
  "name": "@casso-ledger/backend",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "nest build",
    "dev": "nest start --watch",
    "type-check": "tsc --noEmit",
    "test": "jest",
    "test:e2e": "jest --config ./test/jest-e2e.json"
  },
  "dependencies": {
    "@nestjs/common": "10.4.15",
    "@nestjs/core": "10.4.15",
    "@nestjs/platform-express": "10.4.15",
    "@nestjs/typeorm": "10.0.2",
    "typeorm": "0.3.20",
    "pg": "8.13.1",
    "reflect-metadata": "0.2.2",
    "rxjs": "7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "10.4.9",
    "@nestjs/testing": "10.4.15",
    "@testcontainers/postgresql": "10.16.0",
    "@types/jest": "29.5.14",
    "@types/node": "22.10.2",
    "@types/supertest": "6.0.2",
    "jest": "29.7.0",
    "supertest": "7.0.0",
    "ts-jest": "29.2.5",
    "ts-node": "10.9.2",
    "typescript": "5.7.2"
  }
}
```

- [ ] **Step 2: Create `apps/backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "declaration": false,
    "outDir": "./dist",
    "strict": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "baseUrl": "./src"
  }
}
```

- [ ] **Step 3: Create `apps/backend/nest-cli.json`**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src"
}
```

- [ ] **Step 4: Create `apps/backend/src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';

@Module({
  imports: [],
})
export class AppModule {}
```

- [ ] **Step 5: Create `apps/backend/src/main.ts`**

```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

- [ ] **Step 6: Write failing e2e test for app bootstrap**

Create `apps/backend/test/app.e2e-spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AppModule (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('boots the application without error', () => {
    expect(app).toBeDefined();
  });
});
```

- [ ] **Step 7: Create `apps/backend/test/jest-e2e.json`**

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" }
}
```

- [ ] **Step 8: Install deps and run e2e test**

Run: `pnpm install && pnpm --filter @casso-ledger/backend test:e2e`
Expected: PASS — `AppModule (e2e) boots the application without error`

- [ ] **Step 9: Commit**

```bash
git add apps/backend
git commit -m "feat: scaffold NestJS backend app"
```

---

### Task 5: Docker Compose (Postgres + Redis for local dev)

**Files:**
- Create: `docker-compose.yml`

**Interfaces:**
- Consumes: nothing
- Produces: local Postgres on `localhost:5432` (db `casso_ledger`, user/pass `casso`/`casso`), Redis on `localhost:6379`, used by Task 6 TypeORM connection and Task 15 integration test's real DB for `pnpm dev`

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: casso
      POSTGRES_PASSWORD: casso
      POSTGRES_DB: casso_ledger
    ports:
      - "5432:5432"
    volumes:
      - casso_pg_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    ports:
      - "6379:6379"

volumes:
  casso_pg_data:
```

- [ ] **Step 2: Verify containers start**

Run: `docker compose up -d postgres redis`
Expected: both containers report `running` in `docker compose ps`

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: add docker-compose for local postgres and redis"
```

---

### Task 6: TypeORM connection config

**Files:**
- Create: `apps/backend/src/config/typeorm.config.ts`
- Modify: `apps/backend/src/app.module.ts`
- Create: `apps/backend/.env`

**Interfaces:**
- Consumes: Postgres container from Task 5
- Produces: `TypeOrmModule` registered in `AppModule`, used by every `infrastructure/*.orm-entity.ts` in Tasks 7-11

- [ ] **Step 1: Create `apps/backend/.env`**

```
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=casso
DB_PASSWORD=casso
DB_DATABASE=casso_ledger
```

- [ ] **Step 2: Install `@nestjs/config` and `dotenv`**

Run: `pnpm --filter @casso-ledger/backend add @nestjs/config`

- [ ] **Step 3: Create `apps/backend/src/config/typeorm.config.ts`**

```typescript
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'casso',
  password: process.env.DB_PASSWORD ?? 'casso',
  database: process.env.DB_DATABASE ?? 'casso_ledger',
  autoLoadEntities: true,
  synchronize: true,
};
```

`synchronize: true` chấp nhận được ở giai đoạn scaffold/MVP thực tập (không có migration file riêng ở plan này) — nâng cấp lên migration-based khi có nhiều người cùng sửa schema hoặc chuẩn bị production thật.

- [ ] **Step 4: Wire into `apps/backend/src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmConfig } from './config/typeorm.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(typeOrmConfig),
  ],
})
export class AppModule {}
```

- [ ] **Step 5: Verify app connects to DB**

Run: `docker compose up -d postgres && pnpm --filter @casso-ledger/backend dev`
Expected: app starts on port 3000 without TypeORM connection error (Ctrl+C to stop after confirming no error in log)

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/config apps/backend/src/app.module.ts apps/backend/.env apps/backend/package.json
git commit -m "feat: wire TypeORM postgres connection into AppModule"
```

---

### Task 7: Customer module (domain + infrastructure)

**Files:**
- Create: `apps/backend/src/modules/customers/domain/customer.ts`
- Create: `apps/backend/src/modules/customers/infrastructure/customer.orm-entity.ts`
- Create: `apps/backend/src/modules/customers/application/customer-repository.port.ts`
- Create: `apps/backend/src/modules/customers/infrastructure/typeorm-customer.repository.ts`
- Create: `apps/backend/src/modules/customers/customers.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Test: `apps/backend/src/modules/customers/domain/customer.spec.ts`

**Interfaces:**
- Consumes: `TypeOrmModule` from Task 6
- Produces: `Customer` domain class, `ICustomerRepository` port, `TypeOrmCustomerRepository`, used by Task 8 (Invoice), Task 9 (Receivable), Task 11 (Payment allocation "same customer" rule)

- [ ] **Step 1: Write failing domain test**

Create `apps/backend/src/modules/customers/domain/customer.spec.ts`:

```typescript
import { Customer } from './customer';

describe('Customer domain entity', () => {
  it('creates a customer with required fields', () => {
    const customer = new Customer({
      id: 'cust-1',
      organizationId: 'org-1',
      name: 'Công ty B',
      taxCode: '0312345678',
      email: 'ap@congtyb.vn',
      phone: '0900000000',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      createdAt: new Date('2026-01-01'),
    });

    expect(customer.id).toBe('cust-1');
    expect(customer.name).toBe('Công ty B');
    expect(customer.defaultPaymentTermDays).toBe(30);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test customer.spec.ts`
Expected: FAIL — Cannot find module './customer'

- [ ] **Step 3: Create `apps/backend/src/modules/customers/domain/customer.ts`**

```typescript
export interface CustomerProps {
  id: string;
  organizationId: string;
  name: string;
  taxCode: string;
  email: string;
  phone: string;
  defaultPaymentTermDays: number;
  creditLimit: number;
  priority: number;
  createdAt: Date;
}

export class Customer {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly taxCode: string;
  readonly email: string;
  readonly phone: string;
  readonly defaultPaymentTermDays: number;
  readonly creditLimit: number;
  readonly priority: number;
  readonly createdAt: Date;

  constructor(props: CustomerProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.name = props.name;
    this.taxCode = props.taxCode;
    this.email = props.email;
    this.phone = props.phone;
    this.defaultPaymentTermDays = props.defaultPaymentTermDays;
    this.creditLimit = props.creditLimit;
    this.priority = props.priority;
    this.createdAt = props.createdAt;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test customer.spec.ts`
Expected: PASS

- [ ] **Step 5: Create `apps/backend/src/modules/customers/infrastructure/customer.orm-entity.ts`**

```typescript
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'customers' })
export class CustomerOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  name: string;

  @Column()
  taxCode: string;

  @Column()
  email: string;

  @Column()
  phone: string;

  @Column()
  defaultPaymentTermDays: number;

  @Column('bigint')
  creditLimit: number;

  @Column()
  priority: number;

  @Column()
  createdAt: Date;
}
```

- [ ] **Step 6: Create `apps/backend/src/modules/customers/application/customer-repository.port.ts`**

```typescript
import { EntityManager } from 'typeorm';
import { Customer } from '../domain/customer';

export interface ICustomerRepository {
  findById(id: string): Promise<Customer | null>;
  save(customer: Customer, manager?: EntityManager): Promise<void>;
}

export const CUSTOMER_REPOSITORY = Symbol('CUSTOMER_REPOSITORY');
```

- [ ] **Step 7: Create `apps/backend/src/modules/customers/infrastructure/typeorm-customer.repository.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Customer } from '../domain/customer';
import { ICustomerRepository } from '../application/customer-repository.port';
import { CustomerOrmEntity } from './customer.orm-entity';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Injectable()
export class TypeOrmCustomerRepository implements ICustomerRepository {
  constructor(
    @InjectRepository(CustomerOrmEntity)
    private readonly repo: Repository<CustomerOrmEntity>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findById(id: string): Promise<Customer | null> {
    const row = await this.repo.findOne({ where: { id, organizationId: this.tenantContext.getOrganizationId() } });
    if (!row) return null;
    return new Customer(row);
  }

  async save(customer: Customer, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(CustomerOrmEntity) : this.repo;
    await repo.save({ ...customer, organizationId: this.tenantContext.getOrganizationId() } as CustomerOrmEntity);
  }
}
```

- [ ] **Step 8: Create `apps/backend/src/modules/customers/customers.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerOrmEntity } from './infrastructure/customer.orm-entity';
import { TypeOrmCustomerRepository } from './infrastructure/typeorm-customer.repository';
import { CUSTOMER_REPOSITORY } from './application/customer-repository.port';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerOrmEntity])],
  providers: [
    { provide: CUSTOMER_REPOSITORY, useClass: TypeOrmCustomerRepository },
  ],
  exports: [CUSTOMER_REPOSITORY],
})
export class CustomersModule {}
```

- [ ] **Step 9: Register `CustomersModule` in `apps/backend/src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmConfig } from './config/typeorm.config';
import { CustomersModule } from './modules/customers/customers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(typeOrmConfig),
    CustomersModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 10: Run full test suite and verify app still boots**

Run: `pnpm --filter @casso-ledger/backend test && pnpm --filter @casso-ledger/backend test:e2e`
Expected: all PASS

- [ ] **Step 11: Commit**

```bash
git add apps/backend/src/modules/customers apps/backend/src/app.module.ts
git commit -m "feat: add Customer domain entity, repository port, and TypeORM implementation"
```

---

### Task 8: Invoice module (domain + infrastructure)

**Files:**
- Create: `apps/backend/src/modules/invoices/domain/invoice.ts`
- Create: `apps/backend/src/modules/invoices/infrastructure/invoice.orm-entity.ts`
- Create: `apps/backend/src/modules/invoices/application/invoice-repository.port.ts`
- Create: `apps/backend/src/modules/invoices/infrastructure/typeorm-invoice.repository.ts`
- Create: `apps/backend/src/modules/invoices/invoices.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Test: `apps/backend/src/modules/invoices/domain/invoice.spec.ts`

**Interfaces:**
- Consumes: nothing from other modules (references `customerId` as plain string, no cross-module import — matches "domain has no framework/module dependency")
- Produces: `Invoice` domain class, `IInvoiceRepository`, used by Task 9 (Receivable.invoiceId reference)

- [ ] **Step 1: Write failing domain test**

Create `apps/backend/src/modules/invoices/domain/invoice.spec.ts`:

```typescript
import { Invoice, InvoiceStatus } from './invoice';

describe('Invoice domain entity', () => {
  it('creates an invoice with DRAFT status by default fields provided', () => {
    const invoice = new Invoice({
      id: 'inv-1',
      organizationId: 'org-1',
      customerId: 'cust-1',
      invoiceNumber: 'INV-2026-0012',
      issueDate: new Date('2026-07-20'),
      totalAmount: 50_000_000,
      taxAmount: 5_000_000,
      sourceType: 'MANUAL',
      fileUrl: null,
      status: InvoiceStatus.ISSUED,
      createdAt: new Date('2026-07-20'),
    });

    expect(invoice.invoiceNumber).toBe('INV-2026-0012');
    expect(invoice.status).toBe(InvoiceStatus.ISSUED);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test invoice.spec.ts`
Expected: FAIL — Cannot find module './invoice'

- [ ] **Step 3: Create `apps/backend/src/modules/invoices/domain/invoice.ts`**

```typescript
export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  CANCELLED = 'CANCELLED',
}

export type InvoiceSourceType = 'MANUAL' | 'IMPORT' | 'API' | 'ERP';

export interface InvoiceProps {
  id: string;
  organizationId: string;
  customerId: string;
  invoiceNumber: string;
  issueDate: Date;
  totalAmount: number;
  taxAmount: number;
  sourceType: InvoiceSourceType;
  fileUrl: string | null;
  status: InvoiceStatus;
  createdAt: Date;
}

export class Invoice {
  readonly id: string;
  readonly organizationId: string;
  readonly customerId: string;
  readonly invoiceNumber: string;
  readonly issueDate: Date;
  readonly totalAmount: number;
  readonly taxAmount: number;
  readonly sourceType: InvoiceSourceType;
  readonly fileUrl: string | null;
  readonly status: InvoiceStatus;
  readonly createdAt: Date;

  constructor(props: InvoiceProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.customerId = props.customerId;
    this.invoiceNumber = props.invoiceNumber;
    this.issueDate = props.issueDate;
    this.totalAmount = props.totalAmount;
    this.taxAmount = props.taxAmount;
    this.sourceType = props.sourceType;
    this.fileUrl = props.fileUrl;
    this.status = props.status;
    this.createdAt = props.createdAt;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test invoice.spec.ts`
Expected: PASS

- [ ] **Step 5: Create `apps/backend/src/modules/invoices/infrastructure/invoice.orm-entity.ts`**

```typescript
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { InvoiceStatus, InvoiceSourceType } from '../domain/invoice';

@Entity({ name: 'invoices' })
export class InvoiceOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  customerId: string;

  @Column()
  invoiceNumber: string;

  @Column()
  issueDate: Date;

  @Column('bigint')
  totalAmount: number;

  @Column('bigint')
  taxAmount: number;

  @Column()
  sourceType: InvoiceSourceType;

  @Column({ nullable: true })
  fileUrl: string | null;

  @Column({ type: 'enum', enum: InvoiceStatus })
  status: InvoiceStatus;

  @Column()
  createdAt: Date;
}
```

- [ ] **Step 6: Create `apps/backend/src/modules/invoices/application/invoice-repository.port.ts`**

```typescript
import { EntityManager } from 'typeorm';
import { Invoice } from '../domain/invoice';

export interface IInvoiceRepository {
  findById(id: string): Promise<Invoice | null>;
  save(invoice: Invoice, manager?: EntityManager): Promise<void>;
}

export const INVOICE_REPOSITORY = Symbol('INVOICE_REPOSITORY');
```

- [ ] **Step 7: Create `apps/backend/src/modules/invoices/infrastructure/typeorm-invoice.repository.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Invoice } from '../domain/invoice';
import { IInvoiceRepository } from '../application/invoice-repository.port';
import { InvoiceOrmEntity } from './invoice.orm-entity';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Injectable()
export class TypeOrmInvoiceRepository implements IInvoiceRepository {
  constructor(
    @InjectRepository(InvoiceOrmEntity)
    private readonly repo: Repository<InvoiceOrmEntity>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findById(id: string): Promise<Invoice | null> {
    const row = await this.repo.findOne({ where: { id, organizationId: this.tenantContext.getOrganizationId() } });
    if (!row) return null;
    return new Invoice(row);
  }

  async save(invoice: Invoice, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(InvoiceOrmEntity) : this.repo;
    await repo.save({ ...invoice, organizationId: this.tenantContext.getOrganizationId() } as InvoiceOrmEntity);
  }
}
```

- [ ] **Step 8: Create `apps/backend/src/modules/invoices/invoices.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoiceOrmEntity } from './infrastructure/invoice.orm-entity';
import { TypeOrmInvoiceRepository } from './infrastructure/typeorm-invoice.repository';
import { INVOICE_REPOSITORY } from './application/invoice-repository.port';

@Module({
  imports: [TypeOrmModule.forFeature([InvoiceOrmEntity])],
  providers: [
    { provide: INVOICE_REPOSITORY, useClass: TypeOrmInvoiceRepository },
  ],
  exports: [INVOICE_REPOSITORY],
})
export class InvoicesModule {}
```

- [ ] **Step 9: Register `InvoicesModule` in `apps/backend/src/app.module.ts`**

Add `InvoicesModule` to the `imports` array alongside `CustomersModule` (same pattern as Task 7 Step 9).

- [ ] **Step 10: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test && pnpm --filter @casso-ledger/backend test:e2e`
Expected: all PASS

- [ ] **Step 11: Commit**

```bash
git add apps/backend/src/modules/invoices apps/backend/src/app.module.ts
git commit -m "feat: add Invoice domain entity, repository port, and TypeORM implementation"
```

---

### Task 9: Receivable domain entity + state machine

**Files:**
- Create: `apps/backend/src/modules/receivables/domain/receivable.ts`
- Test: `apps/backend/src/modules/receivables/domain/receivable.spec.ts`

**Interfaces:**
- Consumes: `ReceivableStatus` from `@casso-ledger/shared-types` (Task 3)
- Produces: `Receivable` domain class with `applyPaymentAllocation`, `writeOff`, `cancel`, `isOverdue` — used by Task 10 (TypeORM entity), Task 12 (CreateReceivableUseCase), Task 13 (AllocatePaymentUseCase)

This is the core state machine from domain-core-design.md mục 3 — every transition rule below maps directly to a test case.

- [ ] **Step 1: Add workspace dependency**

In `apps/backend/package.json` `dependencies`, add:
```json
"@casso-ledger/shared-types": "workspace:*"
```
Run: `pnpm install`

- [ ] **Step 2: Write failing tests for state machine — partial payment**

Create `apps/backend/src/modules/receivables/domain/receivable.spec.ts`:

```typescript
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Receivable } from './receivable';

function buildOpenReceivable(originalAmount: number): Receivable {
  return new Receivable({
    id: 'rec-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    invoiceId: 'inv-1',
    originalAmount,
    paidAmount: 0,
    dueDate: new Date('2026-08-20'),
    status: ReceivableStatus.OPEN,
    salesRepresentativeId: 'user-1',
    createdAt: new Date('2026-07-20'),
    closedAt: null,
  });
}

describe('Receivable domain entity', () => {
  it('transitions OPEN -> PARTIALLY_PAID when partially allocated', () => {
    const receivable = buildOpenReceivable(50_000_000);
    const updated = receivable.applyPaymentAllocation(30_000_000);

    expect(updated.paidAmount).toBe(30_000_000);
    expect(updated.remainingAmount).toBe(20_000_000);
    expect(updated.status).toBe(ReceivableStatus.PARTIALLY_PAID);
  });

  it('transitions to PAID when remainingAmount reaches 0', () => {
    const receivable = buildOpenReceivable(50_000_000).applyPaymentAllocation(30_000_000);
    const updated = receivable.applyPaymentAllocation(20_000_000);

    expect(updated.remainingAmount).toBe(0);
    expect(updated.status).toBe(ReceivableStatus.PAID);
  });

  it('throws when allocation would exceed remainingAmount', () => {
    const receivable = buildOpenReceivable(50_000_000);
    expect(() => receivable.applyPaymentAllocation(60_000_000)).toThrow(
      'Allocation amount exceeds remaining amount',
    );
  });

  it('allows WRITTEN_OFF from OPEN and PARTIALLY_PAID', () => {
    const open = buildOpenReceivable(50_000_000);
    expect(open.writeOff().status).toBe(ReceivableStatus.WRITTEN_OFF);

    const partiallyPaid = open.applyPaymentAllocation(30_000_000);
    expect(partiallyPaid.writeOff().status).toBe(ReceivableStatus.WRITTEN_OFF);
  });

  it('allows CANCELLED only when paidAmount is 0', () => {
    const open = buildOpenReceivable(50_000_000);
    expect(open.cancel().status).toBe(ReceivableStatus.CANCELLED);

    const partiallyPaid = open.applyPaymentAllocation(30_000_000);
    expect(() => partiallyPaid.cancel()).toThrow(
      'Cannot cancel a receivable that has received payment',
    );
  });

  it('computes isOverdue as true only when OPEN/PARTIALLY_PAID and past dueDate', () => {
    const overdue = buildOpenReceivable(50_000_000);
    expect(overdue.isOverdue(new Date('2026-08-21'))).toBe(true);
    expect(overdue.isOverdue(new Date('2026-08-19'))).toBe(false);

    const paid = overdue.applyPaymentAllocation(50_000_000);
    expect(paid.isOverdue(new Date('2026-08-21'))).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @casso-ledger/backend test receivable.spec.ts`
Expected: FAIL — Cannot find module './receivable'

- [ ] **Step 4: Create `apps/backend/src/modules/receivables/domain/receivable.ts`**

```typescript
import { ReceivableStatus } from '@casso-ledger/shared-types';

export interface ReceivableProps {
  id: string;
  organizationId: string;
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

const OPEN_STATUSES = [ReceivableStatus.OPEN, ReceivableStatus.PARTIALLY_PAID];

export class Receivable {
  readonly id: string;
  readonly organizationId: string;
  readonly customerId: string;
  readonly invoiceId: string | null;
  readonly originalAmount: number;
  readonly paidAmount: number;
  readonly dueDate: Date;
  readonly status: ReceivableStatus;
  readonly salesRepresentativeId: string | null;
  readonly createdAt: Date;
  readonly closedAt: Date | null;

  constructor(props: ReceivableProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.customerId = props.customerId;
    this.invoiceId = props.invoiceId;
    this.originalAmount = props.originalAmount;
    this.paidAmount = props.paidAmount;
    this.dueDate = props.dueDate;
    this.status = props.status;
    this.salesRepresentativeId = props.salesRepresentativeId;
    this.createdAt = props.createdAt;
    this.closedAt = props.closedAt;
  }

  get remainingAmount(): number {
    return this.originalAmount - this.paidAmount;
  }

  isOverdue(today: Date): boolean {
    return OPEN_STATUSES.includes(this.status) && this.dueDate.getTime() < today.getTime();
  }

  private withProps(overrides: Partial<ReceivableProps>): Receivable {
    return new Receivable({ ...this, ...overrides });
  }

  applyPaymentAllocation(amount: number): Receivable {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('Allocation amount must be a positive integer');
    }
    if (!OPEN_STATUSES.includes(this.status)) {
      throw new Error(`Cannot allocate payment to a receivable in status ${this.status}`);
    }
    if (amount > this.remainingAmount) {
      throw new Error('Allocation amount exceeds remaining amount');
    }

    const newPaidAmount = this.paidAmount + amount;
    const newRemaining = this.originalAmount - newPaidAmount;
    const newStatus = newRemaining === 0 ? ReceivableStatus.PAID : ReceivableStatus.PARTIALLY_PAID;

    return this.withProps({
      paidAmount: newPaidAmount,
      status: newStatus,
      closedAt: newStatus === ReceivableStatus.PAID ? new Date() : null,
    });
  }

  removePaymentAllocation(amount: number): Receivable {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('Allocation amount must be a positive integer');
    }
    if ([ReceivableStatus.CANCELLED, ReceivableStatus.WRITTEN_OFF].includes(this.status)) {
      throw new Error(`Cannot undo an allocation for a receivable in status ${this.status}`);
    }
    if (amount > this.paidAmount) {
      throw new Error('Allocation amount exceeds paid amount');
    }

    const newPaidAmount = this.paidAmount - amount;
    return this.withProps({
      paidAmount: newPaidAmount,
      status: newPaidAmount === 0 ? ReceivableStatus.OPEN : ReceivableStatus.PARTIALLY_PAID,
      closedAt: null,
    });
  }

  writeOff(): Receivable {
    if (!OPEN_STATUSES.includes(this.status)) {
      throw new Error(`Cannot write off a receivable in status ${this.status}`);
    }
    return this.withProps({ status: ReceivableStatus.WRITTEN_OFF, closedAt: new Date() });
  }

  cancel(): Receivable {
    if (!OPEN_STATUSES.includes(this.status)) {
      throw new Error(`Cannot cancel a receivable in status ${this.status}`);
    }
    if (this.paidAmount > 0) {
      throw new Error('Cannot cancel a receivable that has received payment');
    }
    return this.withProps({ status: ReceivableStatus.CANCELLED, closedAt: new Date() });
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @casso-ledger/backend test receivable.spec.ts`
Expected: all 6 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/receivables/domain apps/backend/package.json
git commit -m "feat: add Receivable domain entity with state machine"
```

---

### Task 10: Receivable infrastructure + repository

**Files:**
- Create: `apps/backend/src/modules/receivables/infrastructure/receivable.orm-entity.ts`
- Create: `apps/backend/src/modules/receivables/application/receivable-repository.port.ts`
- Create: `apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.ts`
- Create: `apps/backend/src/modules/receivables/receivables.module.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `Receivable` domain class from Task 9
- Produces: `IReceivableRepository` with `findByIdForUpdate` (row lock for allocation), used by Task 12 (use cases) and Task 13 (payment allocation)

- [ ] **Step 1: Create `apps/backend/src/modules/receivables/infrastructure/receivable.orm-entity.ts`**

```typescript
import { Column, Entity, PrimaryGeneratedColumn, VersionColumn } from 'typeorm';
import { ReceivableStatus } from '@casso-ledger/shared-types';

@Entity({ name: 'receivables' })
export class ReceivableOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  customerId: string;

  @Column({ nullable: true })
  invoiceId: string | null;

  @Column('bigint')
  originalAmount: number;

  @Column('bigint', { default: 0 })
  paidAmount: number;

  @Column()
  dueDate: Date;

  @Column({ type: 'enum', enum: ReceivableStatus })
  status: ReceivableStatus;

  @Column({ nullable: true })
  salesRepresentativeId: string | null;

  @Column()
  createdAt: Date;

  @Column({ nullable: true })
  closedAt: Date | null;

  @VersionColumn()
  version: number;
}
```

`@VersionColumn` implement optimistic locking bắt buộc theo domain-core mục 4.3 — TypeORM tự tăng `version` mỗi lần save và throw `OptimisticLockVersionMismatchError` nếu version đã đổi, dùng ở Task 13.

- [ ] **Step 2: Create `apps/backend/src/modules/receivables/application/receivable-repository.port.ts`**

```typescript
import { EntityManager } from 'typeorm';
import { Receivable } from '../domain/receivable';

export interface IReceivableRepository {
  findById(id: string): Promise<Receivable | null>;
  findByIdForUpdate(id: string, manager: EntityManager): Promise<Receivable | null>;
  save(receivable: Receivable, manager?: EntityManager): Promise<void>;
}

export const RECEIVABLE_REPOSITORY = Symbol('RECEIVABLE_REPOSITORY');
```

- [ ] **Step 3: Create `apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Receivable } from '../domain/receivable';
import { IReceivableRepository } from '../application/receivable-repository.port';
import { ReceivableOrmEntity } from './receivable.orm-entity';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Injectable()
export class TypeOrmReceivableRepository implements IReceivableRepository {
  constructor(
    @InjectRepository(ReceivableOrmEntity)
    private readonly repo: Repository<ReceivableOrmEntity>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findById(id: string): Promise<Receivable | null> {
    const row = await this.repo.findOne({ where: { id, organizationId: this.tenantContext.getOrganizationId() } });
    return row ? new Receivable(row) : null;
  }

  async findByIdForUpdate(id: string, manager: EntityManager): Promise<Receivable | null> {
    const row = await manager.findOne(ReceivableOrmEntity, {
      where: { id, organizationId: this.tenantContext.getOrganizationId() },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? new Receivable(row) : null;
  }

  async save(receivable: Receivable, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(ReceivableOrmEntity) : this.repo;
    await repo.save({ ...receivable, organizationId: this.tenantContext.getOrganizationId() } as ReceivableOrmEntity);
  }
}
```

- [ ] **Step 4: Create `apps/backend/src/modules/receivables/receivables.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReceivableOrmEntity } from './infrastructure/receivable.orm-entity';
import { TypeOrmReceivableRepository } from './infrastructure/typeorm-receivable.repository';
import { RECEIVABLE_REPOSITORY } from './application/receivable-repository.port';

@Module({
  imports: [TypeOrmModule.forFeature([ReceivableOrmEntity])],
  providers: [
    { provide: RECEIVABLE_REPOSITORY, useClass: TypeOrmReceivableRepository },
  ],
  exports: [RECEIVABLE_REPOSITORY, TypeOrmModule],
})
export class ReceivablesModule {}
```

- [ ] **Step 5: Register `ReceivablesModule` in `apps/backend/src/app.module.ts`**

Add `ReceivablesModule` to `imports` (same pattern as Task 7 Step 9).

- [ ] **Step 6: Verify app still boots**

Run: `pnpm --filter @casso-ledger/backend test:e2e`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/receivables apps/backend/src/app.module.ts
git commit -m "feat: add Receivable TypeORM entity with optimistic locking and repository"
```

---

### Task 11: Payment & PaymentAllocation domain + infrastructure

**Files:**
- Create: `apps/backend/src/modules/payments/domain/payment.ts`
- Create: `apps/backend/src/modules/payments/domain/payment-allocation.ts`
- Create: `apps/backend/src/modules/payments/infrastructure/payment.orm-entity.ts`
- Create: `apps/backend/src/modules/payments/infrastructure/payment-allocation.orm-entity.ts`
- Create: `apps/backend/src/modules/payments/application/payment-repository.port.ts`
- Create: `apps/backend/src/modules/payments/application/payment-allocation-repository.port.ts`
- Create: `apps/backend/src/modules/payments/infrastructure/typeorm-payment.repository.ts`
- Create: `apps/backend/src/modules/payments/infrastructure/typeorm-payment-allocation.repository.ts`
- Create: `apps/backend/src/modules/payments/payments.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Test: `apps/backend/src/modules/payments/domain/payment.spec.ts`

**Interfaces:**
- Consumes: nothing structurally new (plain domain classes)
- Produces: `Payment`, `PaymentAllocation` domain classes and repositories, used by Task 12 (AllocatePaymentUseCase)

- [ ] **Step 1: Write failing test for Payment.unallocatedAmount**

Create `apps/backend/src/modules/payments/domain/payment.spec.ts`:

```typescript
import { Payment } from './payment';

describe('Payment domain entity', () => {
  it('computes unallocatedAmount from totalAmount minus allocated', () => {
    const payment = new Payment({
      id: 'pay-1',
      organizationId: 'org-1',
      customerId: 'customer-1',
      bankTransactionId: null,
      totalAmount: 25_000_000,
      allocatedAmount: 20_000_000,
      payerName: 'Công ty B',
      receivedAt: new Date('2026-08-01'),
      createdAt: new Date('2026-08-01'),
    });

    expect(payment.unallocatedAmount).toBe(5_000_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test payment.spec.ts`
Expected: FAIL — Cannot find module './payment'

- [ ] **Step 3: Create `apps/backend/src/modules/payments/domain/payment.ts`**

```typescript
export interface PaymentProps {
  id: string;
  organizationId: string;
  customerId: string | null;
  bankTransactionId: string | null;
  totalAmount: number;
  allocatedAmount: number;
  payerName: string;
  receivedAt: Date;
  createdAt: Date;
}

export class Payment {
  readonly id: string;
  readonly organizationId: string;
  readonly customerId: string | null;
  readonly bankTransactionId: string | null;
  readonly totalAmount: number;
  readonly allocatedAmount: number;
  readonly payerName: string;
  readonly receivedAt: Date;
  readonly createdAt: Date;

  constructor(props: PaymentProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.customerId = props.customerId;
    this.bankTransactionId = props.bankTransactionId;
    this.totalAmount = props.totalAmount;
    this.allocatedAmount = props.allocatedAmount;
    this.payerName = props.payerName;
    this.receivedAt = props.receivedAt;
    this.createdAt = props.createdAt;
  }

  get unallocatedAmount(): number {
    return this.totalAmount - this.allocatedAmount;
  }

  withAdditionalAllocation(amount: number): Payment {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('Allocation amount must be a positive integer');
    }
    if (amount > this.unallocatedAmount) {
      throw new Error('Allocation amount exceeds unallocated payment amount');
    }
    return new Payment({ ...this, allocatedAmount: this.allocatedAmount + amount });
  }

  withRemovedAllocation(amount: number): Payment {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('Allocation amount must be a positive integer');
    }
    if (amount > this.allocatedAmount) {
      throw new Error('Allocation amount exceeds allocated payment amount');
    }
    return new Payment({ ...this, allocatedAmount: this.allocatedAmount - amount });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test payment.spec.ts`
Expected: PASS

- [ ] **Step 5: Create `apps/backend/src/modules/payments/domain/payment-allocation.ts`**

```typescript
export interface PaymentAllocationProps {
  id: string;
  organizationId: string;
  paymentId: string;
  receivableId: string;
  allocatedAmount: number;
  allocatedAt: Date;
  allocatedByUserId: string | null;
  deletedAt: Date | null;
  deletedByUserId: string | null;
  undoReason: string | null;
  createdAt: Date;
}

export class PaymentAllocation {
  readonly id: string;
  readonly organizationId: string;
  readonly paymentId: string;
  readonly receivableId: string;
  readonly allocatedAmount: number;
  readonly allocatedAt: Date;
  readonly allocatedByUserId: string | null;
  readonly deletedAt: Date | null;
  readonly deletedByUserId: string | null;
  readonly undoReason: string | null;
  readonly createdAt: Date;

  constructor(props: PaymentAllocationProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.paymentId = props.paymentId;
    this.receivableId = props.receivableId;
    this.allocatedAmount = props.allocatedAmount;
    this.allocatedAt = props.allocatedAt;
    this.allocatedByUserId = props.allocatedByUserId;
    this.deletedAt = props.deletedAt;
    this.deletedByUserId = props.deletedByUserId;
    this.undoReason = props.undoReason;
    this.createdAt = props.createdAt;
  }

  isActive(): boolean {
    return this.deletedAt === null;
  }

  undo(deletedByUserId: string, undoReason: string): PaymentAllocation {
    if (!this.isActive()) {
      throw new Error('Payment allocation is already undone');
    }
    return new PaymentAllocation({
      ...this,
      deletedAt: new Date(),
      deletedByUserId,
      undoReason,
    });
  }
}
```

- [ ] **Step 6: Create ORM entities**

`apps/backend/src/modules/payments/infrastructure/payment.orm-entity.ts`:

```typescript
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'payments' })
export class PaymentOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column({ nullable: true })
  customerId: string | null;

  @Column({ nullable: true })
  bankTransactionId: string | null;

  @Column('bigint')
  totalAmount: number;

  @Column('bigint', { default: 0 })
  allocatedAmount: number;

  @Column()
  payerName: string;

  @Column()
  receivedAt: Date;

  @Column()
  createdAt: Date;
}
```

`apps/backend/src/modules/payments/infrastructure/payment-allocation.orm-entity.ts`:

```typescript
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'payment_allocations' })
export class PaymentAllocationOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  paymentId: string;

  @Column()
  receivableId: string;

  @Column('bigint')
  allocatedAmount: number;

  @Column()
  allocatedAt: Date;

  @Column({ nullable: true })
  allocatedByUserId: string | null;

  @Column({ nullable: true })
  deletedAt: Date | null;

  @Column({ nullable: true })
  deletedByUserId: string | null;

  @Column({ nullable: true })
  undoReason: string | null;

  @Column()
  createdAt: Date;
}
```

- [ ] **Step 7: Create repository ports**

`apps/backend/src/modules/payments/application/payment-repository.port.ts`:

```typescript
import { EntityManager } from 'typeorm';
import { Payment } from '../domain/payment';

export interface IPaymentRepository {
  findByIdForUpdate(id: string, manager: EntityManager): Promise<Payment | null>;
  save(payment: Payment, manager?: EntityManager): Promise<void>;
}

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');
```

`apps/backend/src/modules/payments/application/payment-allocation-repository.port.ts`:

```typescript
import { EntityManager } from 'typeorm';
import { PaymentAllocation } from '../domain/payment-allocation';

export interface IPaymentAllocationRepository {
  findByIdForUpdate(id: string, manager: EntityManager): Promise<PaymentAllocation | null>;
  create(allocation: PaymentAllocation, manager: EntityManager): Promise<void>;
  save(allocation: PaymentAllocation, manager: EntityManager): Promise<void>;
}

export const PAYMENT_ALLOCATION_REPOSITORY = Symbol('PAYMENT_ALLOCATION_REPOSITORY');
```

Audit undo dùng chung `IAuditLogRepository`/`AUDIT_LOG_REPOSITORY` từ `common/audit` của plan Exception Queue. Repository này nhận `EntityManager` tùy chọn để ghi INSERT trong cùng transaction; Payments không tạo một AuditLog entity/repository riêng.

- [ ] **Step 8: Create repository implementations**

`apps/backend/src/modules/payments/infrastructure/typeorm-payment.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Payment } from '../domain/payment';
import { IPaymentRepository } from '../application/payment-repository.port';
import { PaymentOrmEntity } from './payment.orm-entity';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Injectable()
export class TypeOrmPaymentRepository implements IPaymentRepository {
  constructor(
    @InjectRepository(PaymentOrmEntity)
    private readonly repo: Repository<PaymentOrmEntity>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<Payment | null> {
    const row = await manager.findOne(PaymentOrmEntity, {
      where: { id, organizationId: this.tenantContext.getOrganizationId() },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? new Payment(row) : null;
  }

  async save(payment: Payment, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(PaymentOrmEntity) : this.repo;
    await repo.save({ ...payment, organizationId: this.tenantContext.getOrganizationId() } as PaymentOrmEntity);
  }
}
```

`apps/backend/src/modules/payments/infrastructure/typeorm-payment-allocation.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { PaymentAllocation } from '../domain/payment-allocation';
import { IPaymentAllocationRepository } from '../application/payment-allocation-repository.port';
import { PaymentAllocationOrmEntity } from './payment-allocation.orm-entity';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Injectable()
export class TypeOrmPaymentAllocationRepository implements IPaymentAllocationRepository {
  constructor(private readonly tenantContext: TenantContextService) {}

  async findByIdForUpdate(id: string, manager: EntityManager): Promise<PaymentAllocation | null> {
    const row = await manager.findOne(PaymentAllocationOrmEntity, {
      where: { id, organizationId: this.tenantContext.getOrganizationId() },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? new PaymentAllocation(row) : null;
  }

  async create(allocation: PaymentAllocation, manager: EntityManager): Promise<void> {
    await manager.getRepository(PaymentAllocationOrmEntity).save(allocation);
  }

  async save(allocation: PaymentAllocation, manager: EntityManager): Promise<void> {
    await manager.getRepository(PaymentAllocationOrmEntity).save(allocation);
  }
}
```

- [ ] **Step 9: Create `apps/backend/src/modules/payments/payments.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentOrmEntity } from './infrastructure/payment.orm-entity';
import { PaymentAllocationOrmEntity } from './infrastructure/payment-allocation.orm-entity';
import { TypeOrmPaymentRepository } from './infrastructure/typeorm-payment.repository';
import { TypeOrmPaymentAllocationRepository } from './infrastructure/typeorm-payment-allocation.repository';
import { PAYMENT_REPOSITORY } from './application/payment-repository.port';
import { PAYMENT_ALLOCATION_REPOSITORY } from './application/payment-allocation-repository.port';
import { UndoPaymentAllocationUseCase } from './application/undo-payment-allocation.usecase';
import { AllocatePaymentUseCase } from './application/allocate-payment.usecase';
import { ReceivablesModule } from '../receivables/receivables.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentOrmEntity, PaymentAllocationOrmEntity]),
    ReceivablesModule,
  ],
  providers: [
    { provide: PAYMENT_REPOSITORY, useClass: TypeOrmPaymentRepository },
    { provide: PAYMENT_ALLOCATION_REPOSITORY, useClass: TypeOrmPaymentAllocationRepository },
    AllocatePaymentUseCase,
    UndoPaymentAllocationUseCase,
  ],
  exports: [PAYMENT_REPOSITORY, PAYMENT_ALLOCATION_REPOSITORY, AllocatePaymentUseCase, UndoPaymentAllocationUseCase],
})
export class PaymentsModule {}
```

- [ ] **Step 10: Register `PaymentsModule` in `apps/backend/src/app.module.ts`**

Add `PaymentsModule` to `imports` (same pattern as Task 7 Step 9).

- [ ] **Step 11: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 12: Commit**

```bash
git add apps/backend/src/modules/payments apps/backend/src/app.module.ts
git commit -m "feat: add Payment and PaymentAllocation domain entities, repositories"
```

---

### Task 12: AllocatePaymentUseCase (transactional business rule)

**Files:**
- Create: `apps/backend/src/modules/payments/application/allocate-payment.usecase.ts`
- Modify: `apps/backend/src/modules/payments/payments.module.ts`
- Test: `apps/backend/src/modules/payments/application/allocate-payment.usecase.spec.ts`

**Interfaces:**
- Consumes: `IReceivableRepository` (Task 10), `IPaymentRepository`/`IPaymentAllocationRepository` (Task 11)
- Produces: `AllocatePaymentUseCase.execute(...)`, used by Task 13 (controller), and `allocateWithinTransaction(manager, input)`, used by webhook/Exception Queue paths so allocation/status/rollup rules are implemented once.

The public `execute` opens the transaction and delegates to `allocateWithinTransaction`. The internal method requires the caller's `EntityManager`, locks both Payment and Receivable, checks `Payment.customerId === Receivable.customerId`, updates both persisted rollups, inserts `PaymentAllocation`, and emits the resulting domain events only after the transaction commits.

- [ ] **Step 1: Write failing unit test with mocked repositories**

Create `apps/backend/src/modules/payments/application/allocate-payment.usecase.spec.ts`:

```typescript
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { EntityManager } from 'typeorm';
import { AllocatePaymentUseCase } from './allocate-payment.usecase';
import { Receivable } from '../../receivables/domain/receivable';
import { Payment } from '../domain/payment';

describe('AllocatePaymentUseCase', () => {
  function buildReceivable(): Receivable {
    return new Receivable({
      id: 'rec-1',
      organizationId: 'org-1',
      customerId: 'cust-1',
      invoiceId: 'inv-1',
      originalAmount: 50_000_000,
      paidAmount: 0,
      dueDate: new Date('2026-08-20'),
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: 'user-1',
      createdAt: new Date('2026-07-20'),
      closedAt: null,
    });
  }

  function buildPayment(): Payment {
    return new Payment({
      id: 'pay-1',
      organizationId: 'org-1',
      customerId: 'cust-1',
      bankTransactionId: null,
      totalAmount: 30_000_000,
      allocatedAmount: 0,
      payerName: 'Công ty B',
      receivedAt: new Date('2026-08-01'),
      createdAt: new Date('2026-08-01'),
    });
  }

  it('allocates payment to receivable and saves both inside a transaction', async () => {
    const receivable = buildReceivable();
    const payment = buildPayment();

    const receivableRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(receivable),
      save: jest.fn(),
      findById: jest.fn(),
    };
    const paymentRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(payment),
      save: jest.fn(),
    };
    const allocationRepo = { create: jest.fn() };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const dataSource = {
      transaction: jest.fn((cb: (m: EntityManager) => Promise<void>) => cb({} as EntityManager)),
    };

    const useCase = new AllocatePaymentUseCase(
      receivableRepo as any,
      paymentRepo as any,
      allocationRepo as any,
      dataSource as any,
      tenantContext as any,
    );

    await useCase.execute({
      paymentId: 'pay-1',
      receivableId: 'rec-1',
      amount: 30_000_000,
      allocatedByUserId: 'user-1',
    });

    expect(receivableRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ paidAmount: 30_000_000, status: ReceivableStatus.PARTIALLY_PAID }),
      expect.anything(),
    );
    expect(paymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ allocatedAmount: 30_000_000 }),
      expect.anything(),
    );
    expect(allocationRepo.create).toHaveBeenCalled();
  });

  it.each([0, -1, 1.5])('rejects a non-positive integer allocation: %p', async (amount) => {
    const receivableRepo = { findByIdForUpdate: jest.fn(), save: jest.fn() };
    const paymentRepo = { findByIdForUpdate: jest.fn(), save: jest.fn() };
    const allocationRepo = { create: jest.fn() };
    const dataSource = { transaction: jest.fn((cb: (m: EntityManager) => Promise<void>) => cb({} as EntityManager)) };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const useCase = new AllocatePaymentUseCase(
      receivableRepo as any,
      paymentRepo as any,
      allocationRepo as any,
      dataSource as any,
      tenantContext as any,
    );

    await expect(useCase.execute({ paymentId: 'pay-1', receivableId: 'rec-1', amount, allocatedByUserId: 'user-1' }))
      .rejects.toThrow('Allocation amount must be a positive integer');
    expect(receivableRepo.findByIdForUpdate).not.toHaveBeenCalled();
  });

  it('throws if receivable not found', async () => {
    const receivableRepo = { findByIdForUpdate: jest.fn().mockResolvedValue(null), save: jest.fn(), findById: jest.fn() };
    const paymentRepo = { findByIdForUpdate: jest.fn().mockResolvedValue(buildPayment()), save: jest.fn() };
    const allocationRepo = { create: jest.fn() };
    const dataSource = {
      transaction: jest.fn((cb: (m: EntityManager) => Promise<void>) => cb({} as EntityManager)),
    };

    const useCase = new AllocatePaymentUseCase(
      receivableRepo as any,
      paymentRepo as any,
      allocationRepo as any,
      dataSource as any,
      { getOrganizationId: () => 'org-1' } as any,
    );

    await expect(
      useCase.execute({
        paymentId: 'pay-1',
        receivableId: 'missing',
        amount: 1000,
        allocatedByUserId: 'user-1',
      }),
    ).rejects.toThrow('Receivable not found');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test allocate-payment.usecase.spec.ts`
Expected: FAIL — Cannot find module './allocate-payment.usecase'

- [ ] **Step 3: Create `apps/backend/src/modules/payments/application/allocate-payment.usecase.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import {
  IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../receivables/application/receivable-repository.port';
import { IPaymentRepository, PAYMENT_REPOSITORY } from './payment-repository.port';
import {
  IPaymentAllocationRepository,
  PAYMENT_ALLOCATION_REPOSITORY,
} from './payment-allocation-repository.port';
import { PaymentAllocation } from '../domain/payment-allocation';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

export interface AllocatePaymentInput {
  paymentId: string;
  receivableId: string;
  amount: number;
  allocatedByUserId: string | null;
}

@Injectable()
export class AllocatePaymentUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivableRepo: IReceivableRepository,
    @Inject(PAYMENT_REPOSITORY) private readonly paymentRepo: IPaymentRepository,
    @Inject(PAYMENT_ALLOCATION_REPOSITORY)
    private readonly allocationRepo: IPaymentAllocationRepository,
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: AllocatePaymentInput): Promise<void> {
    await this.dataSource.transaction((manager) => this.allocateWithinTransaction(manager, input).then(() => undefined));
  }

  async allocateWithinTransaction(manager: EntityManager, input: AllocatePaymentInput): Promise<void> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new Error('Allocation amount must be a positive integer');
    }

      const receivable = await this.receivableRepo.findByIdForUpdate(input.receivableId, manager);
      if (!receivable) {
        throw new Error('Receivable not found');
      }

      const payment = await this.paymentRepo.findByIdForUpdate(input.paymentId, manager);
      if (!payment) {
        throw new Error('Payment not found');
      }

      if (!payment.customerId) {
        throw new Error('Payment customer is unresolved; send to Exception Queue first');
      }
      if (payment.customerId !== receivable.customerId) {
        throw new Error('Payment and receivable belong to different customers');
      }

      const updatedReceivable = receivable.applyPaymentAllocation(input.amount);
      const updatedPayment = payment.withAdditionalAllocation(input.amount);

      await this.receivableRepo.save(updatedReceivable, manager);
      await this.paymentRepo.save(updatedPayment, manager);
      await this.allocationRepo.create(
        new PaymentAllocation({
          id: randomUUID(),
          organizationId: this.tenantContext.getOrganizationId(),
          paymentId: input.paymentId,
          receivableId: input.receivableId,
          allocatedAmount: input.amount,
          allocatedAt: new Date(),
          allocatedByUserId: input.allocatedByUserId,
          deletedAt: null,
          deletedByUserId: null,
          undoReason: null,
          createdAt: new Date(),
        }),
        manager,
      );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test allocate-payment.usecase.spec.ts`
Expected: both tests PASS

- [ ] **Step 5: Register `AllocatePaymentUseCase` as provider in `payments.module.ts`**

Modify `apps/backend/src/modules/payments/payments.module.ts` — add `AllocatePaymentUseCase` to `providers` and `exports` arrays.

- [ ] **Step 6: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/payments
git commit -m "feat: add AllocatePaymentUseCase with transactional allocation"
```

---

### Task 12A: Undo PaymentAllocation with rollbacks and audit

**Files:**
- Create: `apps/backend/src/modules/payments/application/undo-payment-allocation.usecase.ts`
- Test: `apps/backend/src/modules/payments/application/undo-payment-allocation.usecase.spec.ts`
- Modify: `apps/backend/src/modules/payments/payments.module.ts`

**Interfaces:**
- Consumes: `IPaymentAllocationRepository.findByIdForUpdate/save`, `IPaymentRepository.findByIdForUpdate/save`, `IReceivableRepository.findByIdForUpdate/save`, and shared `IAuditLogRepository` (Exception Queue plan)
- Produces: `UndoPaymentAllocationUseCase.execute({ allocationId, deletedByUserId, undoReason })`; all four writes use the same `EntityManager`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/payments/application/undo-payment-allocation.usecase.spec.ts`:

```typescript
import { EntityManager } from 'typeorm';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Payment } from '../domain/payment';
import { PaymentAllocation } from '../domain/payment-allocation';
import { Receivable } from '../../receivables/domain/receivable';
import { UndoPaymentAllocationUseCase } from './undo-payment-allocation.usecase';

describe('UndoPaymentAllocationUseCase', () => {
  it('soft-deletes once, rolls back both rollups, and audits before/after state', async () => {
    const allocation = new PaymentAllocation({
      id: 'alloc-1', organizationId: 'org-1', paymentId: 'pay-1', receivableId: 'rec-1',
      allocatedAmount: 30_000_000, allocatedAt: new Date(), allocatedByUserId: 'user-1',
      deletedAt: null, deletedByUserId: null, undoReason: null, createdAt: new Date(),
    });
    const payment = new Payment({
      id: 'pay-1', organizationId: 'org-1', customerId: 'cust-1', bankTransactionId: null,
      totalAmount: 50_000_000, allocatedAmount: 30_000_000, payerName: 'Công ty B',
      receivedAt: new Date(), createdAt: new Date(),
    });
    const receivable = new Receivable({
      id: 'rec-1', organizationId: 'org-1', customerId: 'cust-1', invoiceId: null,
      originalAmount: 50_000_000, paidAmount: 30_000_000, dueDate: new Date(),
      status: ReceivableStatus.PARTIALLY_PAID, salesRepresentativeId: null,
      createdAt: new Date(), closedAt: null,
    });
    const manager = {} as EntityManager;
    const allocationRepo = { findByIdForUpdate: jest.fn().mockResolvedValueOnce(allocation).mockResolvedValueOnce(allocation.undo('user-1', 'duplicate')), save: jest.fn() };
    const paymentRepo = { findByIdForUpdate: jest.fn().mockResolvedValue(payment), save: jest.fn() };
    const receivableRepo = { findByIdForUpdate: jest.fn().mockResolvedValue(receivable), save: jest.fn() };
    const auditLogRepo = { create: jest.fn() };
    const dataSource = { transaction: jest.fn((callback) => callback(manager)) };
    const useCase = new UndoPaymentAllocationUseCase(
      allocationRepo as any, paymentRepo as any, receivableRepo as any, auditLogRepo as any, dataSource as any,
    );

    await useCase.execute({ allocationId: 'alloc-1', deletedByUserId: 'user-2', undoReason: 'Correction' });
    expect(paymentRepo.save).toHaveBeenCalledWith(expect.objectContaining({ allocatedAmount: 0 }), manager);
    expect(receivableRepo.save).toHaveBeenCalledWith(expect.objectContaining({ paidAmount: 0, status: ReceivableStatus.OPEN }), manager);
    expect(auditLogRepo.create).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'PAYMENT_ALLOCATE_UNDO' }), manager);
    await expect(useCase.execute({ allocationId: 'alloc-1', deletedByUserId: 'user-2', undoReason: 'Again' })).rejects.toThrow('already undone');
    expect(auditLogRepo.create).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Implement the transaction boundary**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { IReceivableRepository, RECEIVABLE_REPOSITORY } from '../../receivables/application/receivable-repository.port';
import { IPaymentRepository, PAYMENT_REPOSITORY } from './payment-repository.port';
import { IPaymentAllocationRepository, PAYMENT_ALLOCATION_REPOSITORY } from './payment-allocation-repository.port';
import { AUDIT_LOG_REPOSITORY, IAuditLogRepository } from '../../../common/audit/audit-log-repository.port';
import { AuditLog } from '../../../common/audit/audit-log';

export interface UndoPaymentAllocationInput {
  allocationId: string;
  deletedByUserId: string;
  undoReason: string;
}

@Injectable()
export class UndoPaymentAllocationUseCase {
  constructor(
    @Inject(PAYMENT_ALLOCATION_REPOSITORY) private readonly allocationRepo: IPaymentAllocationRepository,
    @Inject(PAYMENT_REPOSITORY) private readonly paymentRepo: IPaymentRepository,
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivableRepo: IReceivableRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLogRepo: IAuditLogRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(input: UndoPaymentAllocationInput): Promise<void> {
    await this.dataSource.transaction(async (manager: EntityManager) => {
      const allocation = await this.allocationRepo.findByIdForUpdate(input.allocationId, manager);
      if (!allocation || !allocation.isActive()) {
        throw new Error('Payment allocation not found or already undone');
      }

      const payment = await this.paymentRepo.findByIdForUpdate(allocation.paymentId, manager);
      const receivable = await this.receivableRepo.findByIdForUpdate(allocation.receivableId, manager);
      if (!payment || !receivable) {
        throw new Error('Payment or receivable not found');
      }

      const undoneAllocation = allocation.undo(input.deletedByUserId, input.undoReason);
      const updatedPayment = payment.withRemovedAllocation(allocation.allocatedAmount);
      const updatedReceivable = receivable.removePaymentAllocation(allocation.allocatedAmount);

      await this.allocationRepo.save(undoneAllocation, manager);
      await this.paymentRepo.save(updatedPayment, manager);
      await this.receivableRepo.save(updatedReceivable, manager);
      await this.auditLogRepo.create(
        new AuditLog({
          organizationId: allocation.organizationId,
          userId: input.deletedByUserId,
          actionType: 'PAYMENT_ALLOCATE_UNDO',
          entityType: 'PaymentAllocation',
          entityId: allocation.id,
          beforeState: { ...allocation },
          afterState: { ...undoneAllocation },
          ipAddress: null,
          createdAt: new Date(),
        }),
        manager,
      );
    });
  }
}
```

- [ ] **Step 3: Run the focused test**

Run: `pnpm --filter @casso-ledger/backend test undo-payment-allocation.usecase.spec.ts`
Expected: PASS for rollback, rollup reduction, audit, and duplicate-undo cases.

---

### Task 13: Receivables & Payments controllers (presentation layer)

**Files:**
- Create: `apps/backend/src/modules/receivables/presentation/dto/create-receivable.dto.ts`
- Create: `apps/backend/src/modules/receivables/presentation/receivables.controller.ts`
- Create: `apps/backend/src/modules/receivables/application/create-receivable.usecase.ts`
- Create: `apps/backend/src/modules/payments/presentation/dto/allocate-payment.dto.ts`
- Create: `apps/backend/src/modules/payments/presentation/dto/undo-payment-allocation.dto.ts`
- Create: `apps/backend/src/modules/payments/presentation/payments.controller.ts`
- Modify: `apps/backend/src/modules/receivables/receivables.module.ts`
- Modify: `apps/backend/src/modules/payments/payments.module.ts`

**Interfaces:**
- Consumes: `AllocatePaymentUseCase`/`UndoPaymentAllocationUseCase` (Tasks 12/12A), `IReceivableRepository` (Task 10), `PermissionGuard` (Multi-tenancy plan)
- Produces: `POST /receivables`, `POST /payments/:id/allocate`, `POST /payments/allocations/:allocationId/undo` HTTP endpoints, used by Task 14 integration test

- [ ] **Step 1: Create `CreateReceivableUseCase`**

`apps/backend/src/modules/receivables/application/create-receivable.usecase.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { IReceivableRepository, RECEIVABLE_REPOSITORY } from './receivable-repository.port';
import { Receivable } from '../domain/receivable';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

export interface CreateReceivableInput {
  customerId: string;
  invoiceId: string | null;
  originalAmount: number;
  dueDate: Date;
  salesRepresentativeId: string | null;
}

@Injectable()
export class CreateReceivableUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivableRepo: IReceivableRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: CreateReceivableInput, manager?: EntityManager): Promise<Receivable> {
    const receivable = new Receivable({
      id: randomUUID(),
      organizationId: this.tenantContext.getOrganizationId(),
      customerId: input.customerId,
      invoiceId: input.invoiceId,
      originalAmount: input.originalAmount,
      paidAmount: 0,
      dueDate: input.dueDate,
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: input.salesRepresentativeId,
      createdAt: new Date(),
      closedAt: null,
    });
    await this.receivableRepo.save(receivable, manager);
    return receivable;
  }
}
```

- [ ] **Step 2: Create `apps/backend/src/modules/receivables/presentation/dto/create-receivable.dto.ts`**

```typescript
import { IsInt, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class CreateReceivableDto {
  @IsUUID()
  customerId: string;

  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @IsInt()
  @IsPositive()
  originalAmount: number;

  @IsString()
  dueDate: string;

  @IsUUID()
  @IsOptional()
  salesRepresentativeId: string | null;
}
```

- [ ] **Step 3: Install `class-validator` and `class-transformer`**

Run: `pnpm --filter @casso-ledger/backend add class-validator class-transformer`

- [ ] **Step 4: Create `apps/backend/src/modules/receivables/presentation/receivables.controller.ts`**

```typescript
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CreateReceivableUseCase } from '../application/create-receivable.usecase';
import { CreateReceivableDto } from './dto/create-receivable.dto';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { Permission } from '../../../common/rbac/permission.enum';

@Controller('receivables')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ReceivablesController {
  constructor(private readonly createReceivableUseCase: CreateReceivableUseCase) {}

  @Post()
  @RequirePermission(Permission.RECEIVABLE_WRITE)
  async create(@Body() dto: CreateReceivableDto) {
    const receivable = await this.createReceivableUseCase.execute({
      customerId: dto.customerId,
      invoiceId: dto.invoiceId ?? null,
      originalAmount: dto.originalAmount,
      dueDate: new Date(dto.dueDate),
      salesRepresentativeId: dto.salesRepresentativeId ?? null,
    });
    return receivable;
  }
}
```

- [ ] **Step 5: Create `apps/backend/src/modules/payments/presentation/dto/allocate-payment.dto.ts`**

```typescript
import { IsInt, IsOptional, IsPositive, IsUUID } from 'class-validator';

export class AllocatePaymentDto {
  @IsUUID()
  receivableId: string;

  @IsInt()
  @IsPositive()
  amount: number;

}
```

- [ ] **Step 6b: Create `apps/backend/src/modules/payments/presentation/dto/undo-payment-allocation.dto.ts`**

```typescript
import { IsNotEmpty, IsString } from 'class-validator';

export class UndoPaymentAllocationDto {
  @IsString()
  @IsNotEmpty()
  undoReason: string;
}
```

- [ ] **Step 6: Create `apps/backend/src/modules/payments/presentation/payments.controller.ts`**

```typescript
import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AllocatePaymentUseCase } from '../application/allocate-payment.usecase';
import { UndoPaymentAllocationUseCase } from '../application/undo-payment-allocation.usecase';
import { AllocatePaymentDto } from './dto/allocate-payment.dto';
import { UndoPaymentAllocationDto } from './dto/undo-payment-allocation.dto';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { Permission } from '../../../common/rbac/permission.enum';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user';

@Controller('payments')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PaymentsController {
  constructor(
    private readonly allocatePaymentUseCase: AllocatePaymentUseCase,
    private readonly undoPaymentAllocationUseCase: UndoPaymentAllocationUseCase,
  ) {}

  @Post(':id/allocate')
  @RequirePermission(Permission.PAYMENT_ALLOCATE)
  async allocate(@Param('id') paymentId: string, @Body() dto: AllocatePaymentDto, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    await this.allocatePaymentUseCase.execute({
      paymentId,
      receivableId: dto.receivableId,
      amount: dto.amount,
      allocatedByUserId: user.userId,
    });
    return { success: true };
  }

  @Post('allocations/:allocationId/undo')
  @RequirePermission(Permission.PAYMENT_ALLOCATE_UNDO)
  async undo(
    @Param('allocationId') allocationId: string,
    @Body() dto: UndoPaymentAllocationDto,
    @Req() req: Request,
  ) {
    const user = req.user as AuthenticatedUser;
    await this.undoPaymentAllocationUseCase.execute({
      allocationId,
      deletedByUserId: user.userId,
      undoReason: dto.undoReason,
    });
    return { success: true };
  }
}
```

- [ ] **Step 7: Register controllers and use cases in respective modules**

In `apps/backend/src/modules/receivables/receivables.module.ts`, add `ReceivablesController` to `controllers: []` and `CreateReceivableUseCase` to `providers: []`.

In `apps/backend/src/modules/payments/payments.module.ts`, add `PaymentsController` to `controllers: []`, and keep both payment use cases in `providers: []`.

- [ ] **Step 8: Enable global validation pipe**

Modify `apps/backend/src/main.ts`:

```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'metrics'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(3000);
}
bootstrap();
```

- [ ] **Step 9: Verify app boots with new controllers**

Run: `pnpm --filter @casso-ledger/backend test:e2e`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/modules/receivables apps/backend/src/modules/payments apps/backend/src/main.ts apps/backend/package.json
git commit -m "feat: add CreateReceivable and AllocatePayment HTTP endpoints"
```

---

### Task 14: Integration test — partial payment allocation (testcontainers)

**Files:**
- Create: `apps/backend/test/payment-allocation.integration.spec.ts`

**Interfaces:**
- Consumes: full `AppModule` (Task 6-13), real Postgres via testcontainers
- Produces: verified end-to-end proof that Task 9 (Receivable state machine), Task 12 (transactional allocation), Task 13 (HTTP endpoints) work together — matches testing-strategy-design.md mục 1, case 2

- [ ] **Step 1: Write the integration test**

Create `apps/backend/test/payment-allocation.integration.spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { PaymentOrmEntity } from '../src/modules/payments/infrastructure/payment.orm-entity';

describe('Payment allocation (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();

    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = moduleRef.get(DataSource);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('partially allocates a payment and updates receivable status to PARTIALLY_PAID', async () => {
    const organizationId = '00000000-0000-0000-0000-000000000001';
    const customerId = '00000000-0000-0000-0000-000000000002';
    const userId = '00000000-0000-0000-0000-000000000003';

    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'Công ty B',
      taxCode: '0312345678',
      email: 'ap@congtyb.vn',
      phone: '0900000000',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      createdAt: new Date(),
    });

    const createReceivableRes = await request(app.getHttpServer())
      .post('/api/v1/receivables')
      .send({
        organizationId,
        customerId,
        originalAmount: 50_000_000,
        dueDate: '2026-08-20T00:00:00.000Z',
        salesRepresentativeId: userId,
      })
      .expect(201);

    const receivableId = createReceivableRes.body.id;

    const paymentId = '00000000-0000-0000-0000-000000000004';
    await dataSource.getRepository(PaymentOrmEntity).save({
      id: paymentId,
      organizationId,
      bankTransactionId: null,
      totalAmount: 30_000_000,
      allocatedAmount: 0,
      payerName: 'Công ty B',
      receivedAt: new Date(),
      createdAt: new Date(),
    });

    await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentId}/allocate`)
      .send({
        receivableId,
        amount: 30_000_000,
        allocatedByUserId: userId,
        organizationId,
      })
      .expect(201);

    const receivableRow = await dataSource.query(
      'SELECT status, "paidAmount" FROM receivables WHERE id = $1',
      [receivableId],
    );

    expect(receivableRow[0].status).toBe('PARTIALLY_PAID');
    expect(Number(receivableRow[0].paidAmount)).toBe(30_000_000);
  });
});
```

- [ ] **Step 2: Verify Docker is available and run the integration test**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- payment-allocation.integration.spec.ts`
Expected: PASS (testcontainers spins up a fresh Postgres, `synchronize: true` from Task 6 creates the schema automatically)

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/payment-allocation.integration.spec.ts
git commit -m "test: add integration test for partial payment allocation flow"
```

---

## Self-Review Notes

- **Spec coverage:** Monorepo structure (scaffolding mục 1) → Task 1-3. Backend Clean Architecture layers (mục 2) → Task 7-13 (every module has domain/application/infrastructure/presentation). Domain Core entities and state machine (domain-core mục 2-4) → Task 7-12. Optimistic locking (domain-core mục 4.3) → Task 10 `@VersionColumn` + `pessimistic_write` lock in `findByIdForUpdate` (row lock during the transaction, version column as defense-in-depth). Frontend structure (scaffolding mục 3) is owned by the frontend design-system and feature plans.
- **Not covered in this plan (by design, out of scope for these 2 specs):** Webhook/Matching Engine, Reminder Automation, RBAC enforcement (this pre-auth scaffold intentionally omits guards; final tenant context comes from the Authentication and Multi-tenancy plans), Frontend app — covered by the separate frontend plans.
- **Type consistency checked:** `IReceivableRepository.findByIdForUpdate(id, manager)` signature (Task 10) matches usage in `AllocatePaymentUseCase` (Task 12) and its mock in the unit test. `Receivable.applyPaymentAllocation`/`writeOff`/`cancel` names are used consistently in Task 9 domain and Task 12 use case.


