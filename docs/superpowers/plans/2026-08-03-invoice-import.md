# Invoice/Receivable Import (Excel/CSV) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `POST /invoices/import` — multipart Excel/CSV upload of invoices with row-level partial-import semantics (valid rows create `Customer` + `Invoice` + `Receivable`, invalid rows are skipped and reported with row number + reason, the whole file is never rejected for a few bad rows), per `2026-08-03-invoice-import-design.md`. Builds on `2026-08-03-project-scaffolding-and-domain-core.md` (`Customer`, `Invoice`, `Receivable` domain classes, `CreateReceivableUseCase`) and `2026-08-03-multi-tenancy-rbac.md` (`BaseRepository` tenant scoping, `TenantContextService`, `JwtAuthGuard`, `PermissionGuard`).

**Architecture:** New module `apps/backend/src/modules/invoice-import/` following the same `application/infrastructure/presentation` layering (no `domain/` — this module orchestrates existing domain entities, it introduces no new domain concept). File parsing is dispatched by file extension to either the `xlsx` package or `csv-parse`, normalized into plain row objects before validation. `InvoiceRowParser` is a pure function (no NestJS/TypeORM import) that validates one row and either returns a typed DTO or throws a row-level `RowValidationError` — this keeps row validation logic unit-testable without any HTTP/DB harness. `ImportInvoicesUseCase` iterates rows independently: a thrown error for one row is caught and recorded, execution continues to the next row (partial import). Customer resolution matches by `taxCode` first, then `customerEmail`, auto-creating a new `Customer` if neither matches. Receivable creation is delegated to the existing `CreateReceivableUseCase` (Domain Core plan) instead of duplicating receivable-construction logic.

**Tech Stack:** `xlsx` (SheetJS) for `.xlsx`/`.xls`, `csv-parse` for `.csv`, `@nestjs/platform-express`'s `FileInterceptor` + `memoryStorage` for multipart upload, Jest + testcontainers + supertest for the integration test (same pattern as the two reference plans).

## Global Constraints

- Amounts: `totalAmount` stays an integer (đồng), no `float` — matches Domain Core plan's amount convention.
- Row numbering in error reports is 1-based counting the header row as row 1, so the first data row is row 2 (matches a user opening the file in Excel and looking at row numbers).
- `InvoiceRowParser` lives in `application/` but is a **pure function**: no `@Injectable()`, no NestJS/TypeORM import, so it is testable with plain Jest and no DI container — mirrors the "domain has no framework import" rule from the scaffolding plan, applied here to the one piece of pure business logic in this module.
- Partial import: one row's failure (validation error, duplicate invoice number, or any thrown error) is caught per-row and never aborts the remaining rows.
- Fixed column names for MVP (no column-mapping UI): `customerName`, `customerTaxCode` (optional), `customerEmail` (optional), `invoiceNumber`, `issueDate`, `dueDate`, `totalAmount` — matches spec mục 1.
- Endpoint gated by `Permission.RECEIVABLE_WRITE` (reused from `2026-08-03-multi-tenancy-rbac.md`, not a new permission) since importing invoices is equivalent to writing receivables.
- Naming: file kebab-case, class PascalCase (spec mục 4, same as reference plans).
- Each valid row is one `DataSource.transaction()` using the same `EntityManager` for Customer, Invoice, and Receivable writes. A row failure rolls back that row and is recorded in the partial-import error list; the loop then continues with the next row. Do not use the default repository connection inside the transaction callback.

---

## File Structure

```
apps/backend/src/
  modules/
    customers/
      application/customer-repository.port.ts        -- MODIFY: add findByTaxCode, findByEmail
      infrastructure/typeorm-customer.repository.ts   -- MODIFY: implement new port methods
    invoices/
      application/invoice-repository.port.ts          -- MODIFY: add findByInvoiceNumber
      infrastructure/typeorm-invoice.repository.ts     -- MODIFY: implement new port method
    receivables/
      receivables.module.ts                            -- MODIFY: export CreateReceivableUseCase
    invoice-import/
      application/
        invoice-row-parser.ts
        import-invoices.usecase.ts
      infrastructure/
        file-row-parser.ts
      presentation/
        invoice-import.controller.ts
      invoice-import.module.ts
  app.module.ts                                        -- MODIFY: register InvoiceImportModule
test/
  invoice-import.integration.spec.ts
```

---

### Task 1: Extend Customer & Invoice repository ports for import lookups

**Files:**
- Modify: `apps/backend/src/modules/customers/application/customer-repository.port.ts`
- Modify: `apps/backend/src/modules/customers/infrastructure/typeorm-customer.repository.ts`
- Modify: `apps/backend/src/modules/invoices/application/invoice-repository.port.ts`
- Modify: `apps/backend/src/modules/invoices/infrastructure/typeorm-invoice.repository.ts`

**Interfaces:**
- Consumes: `BaseRepository.scopedFindOne` (multi-tenancy plan Task 5) — already tenant-scoped, no `organizationId` param needed
- Produces: `ICustomerRepository.findByTaxCode`/`findByEmail`, `IInvoiceRepository.findByInvoiceNumber` — used by Task 4 (`ImportInvoicesUseCase`)

- [ ] **Step 1: Add lookup methods to `ICustomerRepository`**

Modify `apps/backend/src/modules/customers/application/customer-repository.port.ts`:

```typescript
import { EntityManager } from 'typeorm';
import { Customer } from '../domain/customer';

export interface ICustomerRepository {
  findById(id: string): Promise<Customer | null>;
  findByTaxCode(taxCode: string, manager?: EntityManager): Promise<Customer | null>;
  findByEmail(email: string, manager?: EntityManager): Promise<Customer | null>;
  save(customer: Customer, manager?: EntityManager): Promise<void>;
}

export const CUSTOMER_REPOSITORY = Symbol('CUSTOMER_REPOSITORY');
```

- [ ] **Step 2: Implement the new methods in `TypeOrmCustomerRepository`**

Modify `apps/backend/src/modules/customers/infrastructure/typeorm-customer.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Customer } from '../domain/customer';
import { ICustomerRepository } from '../application/customer-repository.port';
import { CustomerOrmEntity } from './customer.orm-entity';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Injectable()
export class TypeOrmCustomerRepository extends BaseRepository<CustomerOrmEntity> implements ICustomerRepository {
  constructor(
    @InjectRepository(CustomerOrmEntity) repo: Repository<CustomerOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findById(id: string): Promise<Customer | null> {
    const row = await this.scopedFindOne({ id } as any);
    return row ? new Customer(row) : null;
  }

  async findByTaxCode(taxCode: string, manager?: EntityManager): Promise<Customer | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = manager
      ? await manager.getRepository(CustomerOrmEntity).findOne({ where: { taxCode, organizationId } as any })
      : await this.scopedFindOne({ taxCode } as any);
    return row ? new Customer(row) : null;
  }

  async findByEmail(email: string, manager?: EntityManager): Promise<Customer | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = manager
      ? await manager.getRepository(CustomerOrmEntity).findOne({ where: { email, organizationId } as any })
      : await this.scopedFindOne({ email } as any);
    return row ? new Customer(row) : null;
  }

  async save(customer: Customer, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(CustomerOrmEntity) : this.ormRepo;
    await repo.save({ ...customer, organizationId: this.tenantContext.getOrganizationId() } as CustomerOrmEntity);
  }
}
```

- [ ] **Step 3: Add lookup method to `IInvoiceRepository`**

Modify `apps/backend/src/modules/invoices/application/invoice-repository.port.ts`:

```typescript
import { EntityManager } from 'typeorm';
import { Invoice } from '../domain/invoice';

export interface IInvoiceRepository {
  findById(id: string): Promise<Invoice | null>;
  findByInvoiceNumber(invoiceNumber: string, manager?: EntityManager): Promise<Invoice | null>;
  save(invoice: Invoice, manager?: EntityManager): Promise<void>;
}

export const INVOICE_REPOSITORY = Symbol('INVOICE_REPOSITORY');
```

- [ ] **Step 4: Implement the new method in `TypeOrmInvoiceRepository`**

Modify `apps/backend/src/modules/invoices/infrastructure/typeorm-invoice.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Invoice } from '../domain/invoice';
import { IInvoiceRepository } from '../application/invoice-repository.port';
import { InvoiceOrmEntity } from './invoice.orm-entity';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Injectable()
export class TypeOrmInvoiceRepository extends BaseRepository<InvoiceOrmEntity> implements IInvoiceRepository {
  constructor(
    @InjectRepository(InvoiceOrmEntity) repo: Repository<InvoiceOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findById(id: string): Promise<Invoice | null> {
    const row = await this.scopedFindOne({ id } as any);
    return row ? new Invoice(row) : null;
  }

  async findByInvoiceNumber(invoiceNumber: string, manager?: EntityManager): Promise<Invoice | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = manager
      ? await manager.getRepository(InvoiceOrmEntity).findOne({ where: { invoiceNumber, organizationId } as any })
      : await this.scopedFindOne({ invoiceNumber } as any);
    return row ? new Invoice(row) : null;
  }

  async save(invoice: Invoice, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(InvoiceOrmEntity) : this.ormRepo;
    await repo.save({ ...invoice, organizationId: this.tenantContext.getOrganizationId() } as InvoiceOrmEntity);
  }
}
```

- [ ] **Step 5: Export `CreateReceivableUseCase` from `ReceivablesModule`**

Modify `apps/backend/src/modules/receivables/receivables.module.ts` — add `CreateReceivableUseCase` to the `exports` array (it is already in `providers` per the Domain Core plan Task 13) so `InvoiceImportModule` (Task 5 below) can inject it:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReceivableOrmEntity } from './infrastructure/receivable.orm-entity';
import { TypeOrmReceivableRepository } from './infrastructure/typeorm-receivable.repository';
import { RECEIVABLE_REPOSITORY } from './application/receivable-repository.port';
import { CreateReceivableUseCase } from './application/create-receivable.usecase';
import { WriteOffReceivableUseCase } from './application/write-off-receivable.usecase';
import { ReceivablesController } from './presentation/receivables.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ReceivableOrmEntity])],
  controllers: [ReceivablesController],
  providers: [
    { provide: RECEIVABLE_REPOSITORY, useClass: TypeOrmReceivableRepository },
    CreateReceivableUseCase,
    WriteOffReceivableUseCase,
  ],
  exports: [RECEIVABLE_REPOSITORY, TypeOrmModule, CreateReceivableUseCase],
})
export class ReceivablesModule {}
```

- [ ] **Step 6: Run full test suite to confirm nothing broke**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS (no existing test calls the removed/changed methods; these are additive)

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/customers apps/backend/src/modules/invoices apps/backend/src/modules/receivables/receivables.module.ts
git commit -m "feat: add customer/invoice lookup methods needed by invoice import"
```

---

### Task 2: `InvoiceRowParser` — pure row validation

**Files:**
- Create: `apps/backend/src/modules/invoice-import/application/invoice-row-parser.ts`
- Test: `apps/backend/src/modules/invoice-import/application/invoice-row-parser.spec.ts`

**Interfaces:**
- Consumes: nothing (pure function, plain `Record<string, unknown>` input)
- Produces: `parseInvoiceRow(row): ParsedInvoiceRow`, `RowValidationError` — used by Task 4 (`ImportInvoicesUseCase`)

- [ ] **Step 1: Write failing tests**

Create `apps/backend/src/modules/invoice-import/application/invoice-row-parser.spec.ts`:

```typescript
import { parseInvoiceRow, RowValidationError } from './invoice-row-parser';

describe('parseInvoiceRow', () => {
  const validRow = {
    customerName: 'Công ty B',
    customerTaxCode: '0312345678',
    customerEmail: 'ap@congtyb.vn',
    invoiceNumber: 'INV-2026-0001',
    issueDate: '2026-07-01',
    dueDate: '2026-08-01',
    totalAmount: '50000000',
  };

  it('parses a fully valid row', () => {
    const parsed = parseInvoiceRow(validRow);

    expect(parsed.customerName).toBe('Công ty B');
    expect(parsed.customerTaxCode).toBe('0312345678');
    expect(parsed.customerEmail).toBe('ap@congtyb.vn');
    expect(parsed.invoiceNumber).toBe('INV-2026-0001');
    expect(parsed.issueDate.toISOString().slice(0, 10)).toBe('2026-07-01');
    expect(parsed.dueDate.toISOString().slice(0, 10)).toBe('2026-08-01');
    expect(parsed.totalAmount).toBe(50_000_000);
  });

  it('treats blank optional fields as null', () => {
    const parsed = parseInvoiceRow({ ...validRow, customerTaxCode: '', customerEmail: '' });
    expect(parsed.customerTaxCode).toBeNull();
    expect(parsed.customerEmail).toBeNull();
  });

  it('throws when customerName is missing', () => {
    const { customerName, ...rest } = validRow;
    expect(() => parseInvoiceRow(rest)).toThrow(RowValidationError);
  });

  it('throws when invoiceNumber is blank', () => {
    expect(() => parseInvoiceRow({ ...validRow, invoiceNumber: '  ' })).toThrow(
      'invoiceNumber is required',
    );
  });

  it('throws when totalAmount is missing or not positive', () => {
    expect(() => parseInvoiceRow({ ...validRow, totalAmount: '' })).toThrow(
      'totalAmount is required and must be a positive integer',
    );
    expect(() => parseInvoiceRow({ ...validRow, totalAmount: '-5' })).toThrow(
      'totalAmount is required and must be a positive integer',
    );
    expect(() => parseInvoiceRow({ ...validRow, totalAmount: '1.5' })).toThrow(
      'totalAmount is required and must be a positive integer',
    );
  });

  it('throws when issueDate or dueDate is not a valid date', () => {
    expect(() => parseInvoiceRow({ ...validRow, issueDate: 'not-a-date' })).toThrow(
      'issueDate is not a valid date',
    );
    expect(() => parseInvoiceRow({ ...validRow, dueDate: 'not-a-date' })).toThrow(
      'dueDate is not a valid date',
    );
  });

  it('throws when dueDate is before issueDate', () => {
    expect(() =>
      parseInvoiceRow({ ...validRow, issueDate: '2026-08-01', dueDate: '2026-07-01' }),
    ).toThrow('dueDate must be on or after issueDate');
  });

  it('accepts a JS Date object for issueDate/dueDate (xlsx cellDates output)', () => {
    const parsed = parseInvoiceRow({
      ...validRow,
      issueDate: new Date('2026-07-01T00:00:00.000Z'),
      dueDate: new Date('2026-08-01T00:00:00.000Z'),
    });
    expect(parsed.issueDate.toISOString().slice(0, 10)).toBe('2026-07-01');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @casso-ledger/backend test invoice-row-parser.spec.ts`
Expected: FAIL — Cannot find module './invoice-row-parser'

- [ ] **Step 3: Create `apps/backend/src/modules/invoice-import/application/invoice-row-parser.ts`**

```typescript
export interface ParsedInvoiceRow {
  customerName: string;
  customerTaxCode: string | null;
  customerEmail: string | null;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  totalAmount: number;
}

export class RowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RowValidationError';
  }
}

function normalizeOptional(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const str = String(value).trim();
  return str === '' ? null : str;
}

function parseDateValue(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'number') {
    // Excel serial date fallback, in case cellDates:true was not honored upstream.
    const excelEpoch = Date.UTC(1899, 11, 30);
    const parsed = new Date(excelEpoch + value * 86_400_000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export function parseInvoiceRow(row: Record<string, unknown>): ParsedInvoiceRow {
  const customerName = normalizeOptional(row.customerName);
  if (!customerName) {
    throw new RowValidationError('customerName is required');
  }

  const invoiceNumber = normalizeOptional(row.invoiceNumber);
  if (!invoiceNumber) {
    throw new RowValidationError('invoiceNumber is required');
  }

  const issueDate = parseDateValue(row.issueDate);
  if (!issueDate) {
    throw new RowValidationError('issueDate is not a valid date');
  }

  const dueDate = parseDateValue(row.dueDate);
  if (!dueDate) {
    throw new RowValidationError('dueDate is not a valid date');
  }

  if (dueDate.getTime() < issueDate.getTime()) {
    throw new RowValidationError('dueDate must be on or after issueDate');
  }

  const rawAmount = typeof row.totalAmount === 'string' ? row.totalAmount.trim() : row.totalAmount;
  const totalAmount = Number(rawAmount);
  if (!Number.isSafeInteger(totalAmount) || totalAmount <= 0) {
    throw new RowValidationError('totalAmount is required and must be a positive integer');
  }

  return {
    customerName,
    customerTaxCode: normalizeOptional(row.customerTaxCode),
    customerEmail: normalizeOptional(row.customerEmail),
    invoiceNumber,
    issueDate,
    dueDate,
    totalAmount,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @casso-ledger/backend test invoice-row-parser.spec.ts`
Expected: all 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/invoice-import/application/invoice-row-parser.ts apps/backend/src/modules/invoice-import/application/invoice-row-parser.spec.ts
git commit -m "feat: add pure InvoiceRowParser for import row validation"
```

---

### Task 3: File-to-rows dispatch (`.xlsx`/`.xls` via `xlsx`, `.csv` via `csv-parse`)

**Files:**
- Create: `apps/backend/src/modules/invoice-import/infrastructure/file-row-parser.ts`
- Test: `apps/backend/src/modules/invoice-import/infrastructure/file-row-parser.spec.ts`
- Modify: `apps/backend/package.json` (add `xlsx`, `csv-parse` dependencies)

**Interfaces:**
- Consumes: nothing
- Produces: `parseFileToRows(buffer, originalFilename): Record<string, unknown>[]` — used by Task 4 (`ImportInvoicesUseCase`)

- [ ] **Step 1: Install dependencies**

Run: `pnpm --filter @casso-ledger/backend add xlsx csv-parse`

In `apps/backend/package.json` `dependencies`, this adds:
```json
"csv-parse": "5.6.0",
"xlsx": "0.18.5"
```

- [ ] **Step 2: Write failing tests**

Create `apps/backend/src/modules/invoice-import/infrastructure/file-row-parser.spec.ts`:

```typescript
import * as XLSX from 'xlsx';
import { EntityManager } from 'typeorm';
import { parseFileToRows } from './file-row-parser';

function buildXlsxBuffer(rows: Record<string, unknown>[]): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('parseFileToRows', () => {
  it('parses rows from an .xlsx buffer', () => {
    const buffer = buildXlsxBuffer([
      { customerName: 'Công ty B', invoiceNumber: 'INV-1', totalAmount: 1000 },
      { customerName: 'Công ty C', invoiceNumber: 'INV-2', totalAmount: 2000 },
    ]);

    const rows = parseFileToRows(buffer, 'invoices.xlsx');

    expect(rows).toHaveLength(2);
    expect(rows[0].customerName).toBe('Công ty B');
    expect(rows[1].invoiceNumber).toBe('INV-2');
  });

  it('parses rows from a .csv buffer', () => {
    const csv = 'customerName,invoiceNumber,totalAmount\nCông ty B,INV-1,1000\nCông ty C,INV-2,2000\n';
    const buffer = Buffer.from(csv, 'utf-8');

    const rows = parseFileToRows(buffer, 'invoices.csv');

    expect(rows).toHaveLength(2);
    expect(rows[0].customerName).toBe('Công ty B');
    expect(rows[1].totalAmount).toBe('2000');
  });

  it('throws for an unsupported file extension', () => {
    expect(() => parseFileToRows(Buffer.from('x'), 'invoices.pdf')).toThrow(
      'Unsupported import file extension: .pdf',
    );
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @casso-ledger/backend test file-row-parser.spec.ts`
Expected: FAIL — Cannot find module './file-row-parser'

- [ ] **Step 4: Create `apps/backend/src/modules/invoice-import/infrastructure/file-row-parser.ts`**

```typescript
import * as XLSX from 'xlsx';
import { parse as parseCsv } from 'csv-parse/sync';

export function parseFileToRows(buffer: Buffer, originalFilename: string): Record<string, unknown>[] {
  const extension = originalFilename.split('.').pop()?.toLowerCase();

  if (extension === 'csv') {
    return parseCsv(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, unknown>[];
  }

  if (extension === 'xlsx' || extension === 'xls') {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  }

  throw new Error(`Unsupported import file extension: .${extension ?? ''}`);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @casso-ledger/backend test file-row-parser.spec.ts`
Expected: all 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/invoice-import/infrastructure/file-row-parser.ts apps/backend/src/modules/invoice-import/infrastructure/file-row-parser.spec.ts apps/backend/package.json
git commit -m "feat: add xlsx/csv file-to-rows dispatch for invoice import"
```

---

### Task 4: `ImportInvoicesUseCase` — partial-import orchestration

**Files:**
- Create: `apps/backend/src/modules/invoice-import/application/import-invoices.usecase.ts`
- Test: `apps/backend/src/modules/invoice-import/application/import-invoices.usecase.spec.ts`

**Interfaces:**
- Consumes: `parseFileToRows` (Task 3), `parseInvoiceRow`/`RowValidationError` (Task 2), `ICustomerRepository` (Task 1), `IInvoiceRepository` (Task 1), `CreateReceivableUseCase` (Domain Core plan), `TenantContextService` (multi-tenancy plan)
- Produces: `ImportInvoicesUseCase.execute(buffer, filename): Promise<ImportInvoicesResult>` — used by Task 5 (`InvoiceImportController`)

- [ ] **Step 1: Write failing unit tests with mocked collaborators**

Create `apps/backend/src/modules/invoice-import/application/import-invoices.usecase.spec.ts`:

```typescript
import * as XLSX from 'xlsx';
import { EntityManager } from 'typeorm';
import { ImportInvoicesUseCase } from './import-invoices.usecase';
import { Customer } from '../../customers/domain/customer';
import { Role } from '../../../modules/organizations/domain/membership';

function buildXlsxBuffer(rows: Record<string, unknown>[]): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('ImportInvoicesUseCase', () => {
  function buildUseCase(overrides?: {
    existingCustomer?: Customer | null;
    existingInvoiceNumber?: string | null;
  }) {
    const customerRepo = {
      findByTaxCode: jest.fn().mockResolvedValue(overrides?.existingCustomer ?? null),
      findByEmail: jest.fn().mockResolvedValue(null),
      findById: jest.fn(),
      save: jest.fn(),
    };
    const invoiceRepo = {
      findByInvoiceNumber: jest.fn().mockImplementation(async (invoiceNumber: string) =>
        invoiceNumber === overrides?.existingInvoiceNumber ? {} : null,
      ),
      findById: jest.fn(),
      save: jest.fn(),
    };
    const createReceivableUseCase = { execute: jest.fn().mockResolvedValue({ id: 'rec-1' }) };
    const tenantContext = {
      getOrganizationId: () => 'org-1',
      getCurrentUser: () => ({ userId: 'user-1', organizationId: 'org-1', role: Role.OWNER }),
    };
    const manager = {} as EntityManager;
    const dataSource = {
      transaction: jest.fn(async (callback: (manager: EntityManager) => Promise<void>) => callback(manager)),
    };

    const useCase = new ImportInvoicesUseCase(
      customerRepo as any,
      invoiceRepo as any,
      createReceivableUseCase as any,
      tenantContext as any,
      dataSource as any,
    );

    return { useCase, customerRepo, invoiceRepo, createReceivableUseCase, dataSource };
  }

  it('creates a customer, invoice, and receivable for a valid row', async () => {
    const { useCase, customerRepo, invoiceRepo, createReceivableUseCase, dataSource } = buildUseCase();
    const buffer = buildXlsxBuffer([
      {
        customerName: 'Công ty B',
        customerTaxCode: '0312345678',
        customerEmail: 'ap@congtyb.vn',
        invoiceNumber: 'INV-2026-0001',
        issueDate: '2026-07-01',
        dueDate: '2026-08-01',
        totalAmount: 50_000_000,
      },
    ]);

    const result = await useCase.execute(buffer, 'invoices.xlsx');

    expect(result.successCount).toBe(1);
    expect(result.failedRows).toEqual([]);
    expect(customerRepo.save).toHaveBeenCalledTimes(1);
    expect(invoiceRepo.save).toHaveBeenCalledTimes(1);
    expect(createReceivableUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ originalAmount: 50_000_000, salesRepresentativeId: 'user-1' }),
      expect.anything(),
    );
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing customer matched by taxCode instead of creating a new one', async () => {
    const existingCustomer = new Customer({
      id: 'cust-existing',
      organizationId: 'org-1',
      name: 'Công ty B',
      taxCode: '0312345678',
      email: 'ap@congtyb.vn',
      phone: '',
      defaultPaymentTermDays: 30,
      creditLimit: 0,
      priority: 1,
      createdAt: new Date(),
    });
    const { useCase, customerRepo } = buildUseCase({ existingCustomer });
    const buffer = buildXlsxBuffer([
      {
        customerName: 'Công ty B',
        customerTaxCode: '0312345678',
        customerEmail: 'ap@congtyb.vn',
        invoiceNumber: 'INV-2026-0002',
        issueDate: '2026-07-01',
        dueDate: '2026-08-01',
        totalAmount: 10_000,
      },
    ]);

    const result = await useCase.execute(buffer, 'invoices.xlsx');

    expect(result.successCount).toBe(1);
    expect(customerRepo.save).not.toHaveBeenCalled();
  });

  it('reports a row-level error with row number and reason, without blocking other rows', async () => {
    const { useCase } = buildUseCase();
    const buffer = buildXlsxBuffer([
      {
        customerName: 'Công ty B',
        invoiceNumber: 'INV-2026-0003',
        issueDate: '2026-07-01',
        dueDate: '2026-08-01',
        totalAmount: '', // missing amount -> invalid
      },
      {
        customerName: 'Công ty C',
        invoiceNumber: 'INV-2026-0004',
        issueDate: '2026-07-01',
        dueDate: '2026-08-01',
        totalAmount: 20_000,
      },
    ]);

    const result = await useCase.execute(buffer, 'invoices.xlsx');

    expect(result.successCount).toBe(1);
    expect(result.failedRows).toEqual([
      {
        rowNumber: 2,
        data: expect.objectContaining({ customerName: 'Công ty B' }),
        errors: ['totalAmount is required and must be a positive integer'],
      },
    ]);
  });

  it('reports DUPLICATE_INVOICE_NUMBER for an invoice number that already exists', async () => {
    const { useCase } = buildUseCase({ existingInvoiceNumber: 'INV-DUP' });
    const buffer = buildXlsxBuffer([
      {
        customerName: 'Công ty B',
        invoiceNumber: 'INV-DUP',
        issueDate: '2026-07-01',
        dueDate: '2026-08-01',
        totalAmount: 20_000,
      },
    ]);

    const result = await useCase.execute(buffer, 'invoices.xlsx');

    expect(result.successCount).toBe(0);
    expect(result.failedRows).toEqual([
      { rowNumber: 2, data: expect.objectContaining({ invoiceNumber: 'INV-DUP' }), errors: ['DUPLICATE_INVOICE_NUMBER'] },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @casso-ledger/backend test import-invoices.usecase.spec.ts`
Expected: FAIL — Cannot find module './import-invoices.usecase'

- [ ] **Step 3: Create `apps/backend/src/modules/invoice-import/application/import-invoices.usecase.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ICustomerRepository, CUSTOMER_REPOSITORY } from '../../customers/application/customer-repository.port';
import { Customer } from '../../customers/domain/customer';
import { IInvoiceRepository, INVOICE_REPOSITORY } from '../../invoices/application/invoice-repository.port';
import { Invoice, InvoiceStatus } from '../../invoices/domain/invoice';
import { CreateReceivableUseCase } from '../../receivables/application/create-receivable.usecase';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { parseFileToRows } from '../infrastructure/file-row-parser';
import { ParsedInvoiceRow, parseInvoiceRow, RowValidationError } from './invoice-row-parser';

export interface ImportRowFailure {
  rowNumber: number;
  data: Record<string, unknown>;
  errors: string[];
}

export interface ImportInvoicesResult {
  totalRows: number;
  successCount: number;
  failedRows: ImportRowFailure[];
}

const HEADER_ROW_OFFSET = 2; // row 1 is the header, first data row is row 2

@Injectable()
export class ImportInvoicesUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customerRepo: ICustomerRepository,
    @Inject(INVOICE_REPOSITORY) private readonly invoiceRepo: IInvoiceRepository,
    private readonly createReceivableUseCase: CreateReceivableUseCase,
    private readonly tenantContext: TenantContextService,
    private readonly dataSource: DataSource,
  ) {}

  async execute(buffer: Buffer, filename: string): Promise<ImportInvoicesResult> {
    const rawRows = parseFileToRows(buffer, filename);
    const failedRows: ImportRowFailure[] = [];
    let successCount = 0;

    for (let index = 0; index < rawRows.length; index++) {
      const rowNumber = index + HEADER_ROW_OFFSET;
      try {
        await this.importRow(rawRows[index]);
        successCount++;
      } catch (error) {
        failedRows.push({
          rowNumber,
          data: rawRows[index],
          errors: [error instanceof Error ? error.message : 'Unknown error'],
        });
      }
    }

    return {
      totalRows: rawRows.length,
      successCount,
      failedRows,
    };
  }

  private async importRow(rawRow: Record<string, unknown>): Promise<void> {
    const parsed = parseInvoiceRow(rawRow);
    const currentUser = this.tenantContext.getCurrentUser();
    if (!currentUser) {
      throw new Error('Import accessed outside of an authenticated request');
    }

    await this.dataSource.transaction(async (manager) => {
      const existingInvoice = await this.invoiceRepo.findByInvoiceNumber(parsed.invoiceNumber, manager);
      if (existingInvoice) {
        throw new RowValidationError('DUPLICATE_INVOICE_NUMBER');
      }

      const customer = await this.resolveOrCreateCustomer(parsed, manager);
      const invoice = new Invoice({
        id: randomUUID(),
        organizationId: this.tenantContext.getOrganizationId(),
        customerId: customer.id,
        invoiceNumber: parsed.invoiceNumber,
        issueDate: parsed.issueDate,
        totalAmount: parsed.totalAmount,
        taxAmount: 0,
        sourceType: 'IMPORT',
        fileUrl: null,
        status: InvoiceStatus.ISSUED,
        createdAt: new Date(),
      });
      await this.invoiceRepo.save(invoice, manager);
      await this.createReceivableUseCase.execute({
        customerId: customer.id,
        invoiceId: invoice.id,
        originalAmount: parsed.totalAmount,
        dueDate: parsed.dueDate,
        salesRepresentativeId: currentUser.userId,
      }, manager);
    });
  }

  private async resolveOrCreateCustomer(parsed: ParsedInvoiceRow, manager: EntityManager): Promise<Customer> {
    let customer: Customer | null = null;

    if (parsed.customerTaxCode) {
      customer = await this.customerRepo.findByTaxCode(parsed.customerTaxCode, manager);
    }
    if (!customer && parsed.customerEmail) {
      customer = await this.customerRepo.findByEmail(parsed.customerEmail, manager);
    }
    if (customer) {
      return customer;
    }

    const newCustomer = new Customer({
      id: randomUUID(),
      organizationId: this.tenantContext.getOrganizationId(),
      name: parsed.customerName,
      taxCode: parsed.customerTaxCode ?? '',
      email: parsed.customerEmail ?? '',
      phone: '',
      defaultPaymentTermDays: 30,
      creditLimit: 0,
      priority: 1,
      createdAt: new Date(),
    });
    await this.customerRepo.save(newCustomer, manager);
    return newCustomer;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @casso-ledger/backend test import-invoices.usecase.spec.ts`
Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/invoice-import/application/import-invoices.usecase.ts apps/backend/src/modules/invoice-import/application/import-invoices.usecase.spec.ts
git commit -m "feat: add ImportInvoicesUseCase with partial-import row handling"
```

---

### Task 5: `InvoiceImportController` + module wiring

**Files:**
- Create: `apps/backend/src/modules/invoice-import/presentation/invoice-import.controller.ts`
- Create: `apps/backend/src/modules/invoice-import/invoice-import.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/backend/package.json` (add `@types/multer` devDependency)

**Interfaces:**
- Consumes: `ImportInvoicesUseCase` (Task 4), `JwtAuthGuard`/`PermissionGuard`/`Permission.RECEIVABLE_WRITE` (multi-tenancy plan)
- Produces: `POST /invoices/import` HTTP endpoint — used by Task 6 integration test

- [ ] **Step 1: Install `@types/multer`**

Run: `pnpm --filter @casso-ledger/backend add -D @types/multer`

(`@nestjs/platform-express`'s `FileInterceptor` already ships with the `multer` runtime dependency transitively — only the type definitions are missing.)

- [ ] **Step 2: Create `apps/backend/src/modules/invoice-import/presentation/invoice-import.controller.ts`**

```typescript
import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportInvoicesUseCase, ImportInvoicesResult } from '../application/import-invoices.usecase';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { Permission } from '../../../common/rbac/permission.enum';

@Controller('invoices')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class InvoiceImportController {
  constructor(private readonly importInvoicesUseCase: ImportInvoicesUseCase) {}

  @Post('import')
  @RequirePermission(Permission.RECEIVABLE_WRITE)
  @UseInterceptors(FileInterceptor('file'))
  async import(@UploadedFile() file?: Express.Multer.File): Promise<ImportInvoicesResult> {
    if (!file) {
      throw new BadRequestException('A file is required under the "file" form field');
    }
    return this.importInvoicesUseCase.execute(file.buffer, file.originalname);
  }
}
```

`FileInterceptor` defaults to in-memory storage when no `dest`/`storage` option is given, so `file.buffer` is populated directly — no temp file cleanup needed.

- [ ] **Step 3: Create `apps/backend/src/modules/invoice-import/invoice-import.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { ImportInvoicesUseCase } from './application/import-invoices.usecase';
import { InvoiceImportController } from './presentation/invoice-import.controller';

@Module({
  imports: [CustomersModule, InvoicesModule, ReceivablesModule],
  controllers: [InvoiceImportController],
  providers: [ImportInvoicesUseCase],
})
export class InvoiceImportModule {}
```

- [ ] **Step 4: Export `CUSTOMER_REPOSITORY`/`INVOICE_REPOSITORY` from their modules (verify, no code change expected)**

Confirm `apps/backend/src/modules/customers/customers.module.ts` still `exports: [CUSTOMER_REPOSITORY]` and `apps/backend/src/modules/invoices/invoices.module.ts` still `exports: [INVOICE_REPOSITORY]` (both already true from the Domain Core plan) — `InvoiceImportModule` importing `CustomersModule`/`InvoicesModule` is sufficient for `ImportInvoicesUseCase`'s constructor injection to resolve.

- [ ] **Step 5: Register `InvoiceImportModule` in `apps/backend/src/app.module.ts`**

Add `InvoiceImportModule` to the `imports` array, alongside `CustomersModule`, `InvoicesModule`, `ReceivablesModule`, `PaymentsModule`, `OrganizationsModule` (same pattern as every prior module registration).

- [ ] **Step 6: Verify app still boots**

Run: `pnpm --filter @casso-ledger/backend test:e2e`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/invoice-import apps/backend/src/app.module.ts apps/backend/package.json
git commit -m "feat: add POST /invoices/import endpoint with FileInterceptor upload"
```

---

### Task 6: Integration test — partial import via multipart upload (testcontainers)

**Files:**
- Create: `apps/backend/test/invoice-import.integration.spec.ts`

**Interfaces:**
- Consumes: full `AppModule` (Tasks 1-5, plus Domain Core and multi-tenancy plans), real Postgres via testcontainers, real multipart upload via supertest `.attach()`
- Produces: verified end-to-end proof that 1 valid row creates exactly 1 `Receivable` and the 1 invalid row (missing `totalAmount`) is reported at row 2 with a reason, without aborting the valid row

- [ ] **Step 1: Write the integration test**

Create `apps/backend/test/invoice-import.integration.spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import * as XLSX from 'xlsx';
import { AppModule } from '../src/app.module';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { SubscriptionOrmEntity } from '../src/modules/billing/infrastructure/subscription.orm-entity';

function buildImportXlsxBuffer(): Buffer {
  const rows = [
    {
      customerName: 'Công ty B',
      customerTaxCode: '0312345678',
      customerEmail: 'ap@congtyb.vn',
      invoiceNumber: 'INV-2026-1001',
      issueDate: '2026-07-01',
      dueDate: '2026-08-01',
      totalAmount: 50_000_000,
    },
    {
      customerName: 'Công ty C',
      customerTaxCode: '0398765432',
      customerEmail: 'ap@congtyc.vn',
      invoiceNumber: 'INV-2026-1002',
      issueDate: '2026-07-01',
      dueDate: '2026-08-01',
      totalAmount: '', // missing amount -> row-level error
    },
  ];
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('Invoice import (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  const organizationId = '00000000-0000-0000-0000-000000000101';
  const userId = '00000000-0000-0000-0000-000000000102';

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
    jwtService = moduleRef.get(JwtService);

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Import Owner',
      email: 'import-owner@test.vn',
      passwordHash: 'fixture-hash',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      id: '00000000-0000-0000-0000-000000000103',
      organizationId,
      userId,
      role: 'OWNER',
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });
    await dataSource.getRepository(SubscriptionOrmEntity).save({
      id: '00000000-0000-0000-0000-000000000104',
      organizationId,
      planId: 'FREE',
      receivableMonthlyLimit: 50,
      bankConnectionLimit: 1,
      status: 'ACTIVE',
      currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-08-31T23:59:59.999Z'),
      createdAt: new Date(),
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('imports the valid row, reports the invalid row, and creates exactly 1 Receivable', async () => {
    const token = jwtService.sign({ userId, organizationId, role: 'OWNER' });
    const buffer = buildImportXlsxBuffer();

    const response = await request(app.getHttpServer())
      .post('/api/v1/invoices/import')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'invoices.xlsx')
      .expect(201);

    expect(response.body.successCount).toBe(1);
    expect(response.body.failedRows).toEqual([
      {
        rowNumber: 3,
        data: expect.objectContaining({ customerName: 'Công ty C' }),
        errors: ['totalAmount is required and must be a positive integer'],
      },
    ]);

    const receivables = await dataSource.query(
      'SELECT r.id, r."originalAmount" FROM receivables r JOIN invoices i ON i.id = r."invoiceId" WHERE r."organizationId" = $1',
      [organizationId],
    );
    expect(receivables).toHaveLength(1);
    expect(Number(receivables[0].originalAmount)).toBe(50_000_000);

    const invoices = await dataSource.query(
      'SELECT "invoiceNumber" FROM invoices WHERE "organizationId" = $1',
      [organizationId],
    );
    expect(invoices).toHaveLength(1);
    expect(invoices[0].invoiceNumber).toBe('INV-2026-1001');
  });

  it('rejects a request with no file attached', async () => {
    const token = jwtService.sign({ userId, organizationId, role: 'OWNER' });

    await request(app.getHttpServer())
      .post('/api/v1/invoices/import')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
```

Note: `json_to_sheet` emits a header row derived from object keys, so with `XLSX.utils.json_to_sheet` the header occupies row 1 and the 2 data rows are rows 2-3 in the underlying sheet — the invalid row (missing `totalAmount`) is the 2nd data row, hence expected `row: 3` matching `ImportInvoicesUseCase`'s `HEADER_ROW_OFFSET` (index 1 + 2).

- [ ] **Step 2: Run the integration test**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- invoice-import.integration.spec.ts`
Expected: both tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/invoice-import.integration.spec.ts
git commit -m "test: add integration test for partial invoice import via multipart upload"
```

---

## Self-Review Notes

- **Spec coverage:** File parsing dispatch by extension (`xlsx`/`csv`) → Task 3. Row-level validation independent per row → Task 2 + Task 4. Customer resolution by `taxCode` first then `customerEmail`, auto-create if not found → Task 4. Duplicate `invoiceNumber` within organization → `DUPLICATE_INVOICE_NUMBER` in Task 4. Invoice (`sourceType=IMPORT`) + 1:1 Receivable creation reusing `CreateReceivableUseCase` → Task 4. Canonical response `{ totalRows, successCount, failedRows: [{ rowNumber, data, errors }] }` → `ImportInvoicesResult` in Task 4, returned directly by the controller in Task 5. Multipart `POST /invoices/import` → Task 5.
- **Not covered in this plan (by design, flagged as open questions in the spec mục 3):** Max file size / row count limits and whether import should move to an async queue — spec explicitly marks this as non-blocking for implementation; if adopted later, `ImportInvoicesUseCase.execute` would need to accept a size/row cap and the controller would add a `MaxFileSizeValidator`. Marking auto-created customers with `createdVia: IMPORT` — spec explicitly leaves this open; `Customer` domain class (Domain Core plan) has no such field today, so it is not added here to avoid inventing an undesigned column.
- **Transaction boundary:** every valid row uses one `DataSource.transaction()` and passes its `EntityManager` through Customer, Invoice, and CreateReceivable writes. A failed row rolls back completely before the partial-import loop records its error and continues.
- **Type consistency checked:** `ICustomerRepository`/`IInvoiceRepository` new methods (Task 1) match their usage in `ImportInvoicesUseCase` (Task 4) and the mocks in its unit test (same method names and return types: `Customer | null`, `Invoice | null`). `CreateReceivableUseCase.execute()`'s input shape (`customerId`, `invoiceId`, `originalAmount`, `dueDate`, `salesRepresentativeId` — no `organizationId`, per the multi-tenancy plan's Task 6 migration) matches exactly what `ImportInvoicesUseCase.importRow` passes, including the active row `EntityManager`. `ParsedInvoiceRow.totalAmount` is a positive integer and its fields are consumed 1:1 by `ImportInvoicesUseCase` (Task 4) with no renamed/missing fields. Row numbering convention (`HEADER_ROW_OFFSET = 2`) is asserted identically in the unit test (Task 4, `rowNumber: 2`) and the integration test (Task 6, `rowNumber: 3` for the 2nd data row), consistent with treating the header as row 1.
