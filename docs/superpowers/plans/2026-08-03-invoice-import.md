# Invoice/Receivable Import (Excel/CSV) Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement POST /invoices/import for .xlsx, .xls, and .csv files, creating Customer + Invoice + Receivable per valid row while reporting invalid rows without rolling back valid rows.

**Architecture:** Add an invoice-import module with a pure row parser, an infrastructure file parser, an application use case, and a multipart controller. Each valid row uses one DataSource.transaction() and passes the same EntityManager through Customer, Invoice, and Receivable writes. Existing repositories and CreateReceivableUseCase are widened with optional manager parameters; existing callers keep their current behavior.

**Tech Stack:** NestJS FileInterceptor with in-memory storage, xlsx for .xlsx/.xls, csv-parse for .csv, Node crypto for SHA-256/idempotency fingerprints, Jest, Supertest, and Testcontainers PostgreSQL.

## Global Constraints

- Exact headers: customerName, customerTaxCode, customerEmail, invoiceNumber, issueDate, dueDate, totalAmount, taxAmount.
- All eight headers must be present with exact casing after trimming a UTF-8 BOM; extra headers are ignored.
- customerTaxCode, customerEmail, and taxAmount values may be blank; blank taxAmount becomes 0.
- .xlsx/.xls reads only the first sheet. CSV accepts UTF-8 with optional BOM and comma delimiter only.
- File size is at most 5 MiB and data rows are at most 1,000. A limit violation rejects the whole request.
- totalAmount accepts only a safe positive integer or a digit-only string. taxAmount accepts only a safe non-negative integer or a digit-only string.
- totalAmount is the gross amount owed and includes tax; 0 <= taxAmount <= totalAmount.
- CSV dates must be strict YYYY-MM-DD; Excel date cells may be JavaScript Date values. Invalid dates and dueDate < issueDate fail the row.
- Every string is trimmed; email is lowercased; tax code is not reformatted.
- Customer matching is tax code first and email second. If both identifiers resolve to different Customers, the row fails with CUSTOMER_MISMATCH. If neither resolves, create a Customer from the row, even when both identifiers are blank.
- A newly created Receivable gets salesRepresentativeId equal to the authenticated importer.
- The import endpoint requires Permission.RECEIVABLE_IMPORT and an Idempotency-Key.
- Idempotency fingerprint is SHA-256 of filename + file bytes; reuse the existing IdempotencyService.
- Each valid row has its own transaction. The loop is sequential and continues after row failures.
- Duplicate invoice numbers are checked in the transaction and protected by a unique database index on (organizationId, invoiceNumber).
- Row-level failures remain failedRows: { rowNumber, data, errors: string[] }. Known validation errors use stable messages/codes; unexpected errors use IMPORT_ROW_FAILED and are logged without leaking database details.
- A syntactically valid file always returns HTTP 201, including when successCount is zero. Missing file, invalid headers, malformed file, unsupported extension, empty data, and row-count limits return HTTP 400. A file over 5 MiB returns HTTP 413 Payload Too Large.
- Each import writes one audit record with action/entity INVOICE_IMPORT; only filename, SHA-256, row counts, and actor metadata are stored, never raw row data.
- Production code uses node: builtins, no any, no unsafe domain-to-ORM casts, explicit mappers, tenant-scoped queries, and AppError for application failures.

## File Structure

Create:

- apps/backend/src/modules/invoice-import/application/invoice-row-parser.ts
- apps/backend/src/modules/invoice-import/application/invoice-row-parser.spec.ts
- apps/backend/src/modules/invoice-import/application/import-invoices.usecase.ts
- apps/backend/src/modules/invoice-import/application/import-invoices.usecase.spec.ts
- apps/backend/src/modules/invoice-import/application/import-request-fingerprint.ts
- apps/backend/src/modules/invoice-import/infrastructure/file-row-parser.ts
- apps/backend/src/modules/invoice-import/infrastructure/file-row-parser.spec.ts
- apps/backend/src/modules/invoice-import/presentation/invoice-import.controller.ts
- apps/backend/src/modules/invoice-import/presentation/invoice-import.controller.spec.ts
- apps/backend/src/modules/invoice-import/invoice-import.module.ts
- apps/backend/test/invoice-import.e2e-spec.ts

Modify:

- apps/backend/src/modules/customers/application/customer-repository.port.ts
- apps/backend/src/modules/customers/infrastructure/typeorm-customer.repository.ts
- apps/backend/src/modules/customers/infrastructure/typeorm-customer.repository.spec.ts
- apps/backend/src/modules/invoices/application/invoice-repository.port.ts
- apps/backend/src/modules/invoices/infrastructure/typeorm-invoice.repository.ts
- apps/backend/src/modules/invoices/infrastructure/typeorm-invoice.repository.spec.ts
- apps/backend/src/modules/invoices/infrastructure/invoice.orm-entity.ts
- apps/backend/src/modules/receivables/application/create-receivable.usecase.ts
- apps/backend/src/modules/receivables/application/create-receivable.usecase.spec.ts
- apps/backend/src/common/audit/audit.enums.ts
- apps/backend/src/app.module.ts
- apps/backend/package.json

---

### Task 1: Make existing write contracts transaction-safe and invoice numbers unique

Files:

- Modify the repository ports, repositories, ORM entity, and CreateReceivableUseCase listed above.
- Test the changed repositories and use case in their existing spec files.

Interfaces:

~~~typescript
export interface CreateReceivableInput {
  customerId: string;
  invoiceId: string | null;
  originalAmount: number;
  dueDate: Date;
  salesRepresentativeId: string | null;
}

ICustomerRepository.findById(id: string, manager?: EntityManager): Promise<Customer | null>
ICustomerRepository.findByTaxCode(taxCode: string, manager?: EntityManager): Promise<Customer | null>
ICustomerRepository.findByEmail(email: string, manager?: EntityManager): Promise<Customer | null>
IInvoiceRepository.findByInvoiceNumber(invoiceNumber: string, manager?: EntityManager): Promise<Invoice | null>
CreateReceivableUseCase.execute(input: CreateReceivableInput, manager?: EntityManager): Promise<Receivable>
~~~

- [ ] Step 1: Write failing repository tests for manager-scoped lookups

Add tests proving findById, findByTaxCode, findByEmail, and findByInvoiceNumber use manager.getRepository(...).findOne() when a manager is passed, and include the current organizationId in every where clause.

The tests must also prove that calls without a manager continue using the existing BaseRepository tenant-scoped path.

- [ ] Step 2: Run the focused repository tests and verify failure

Run:

~~~bash
pnpm --filter @casso-ledger/backend test typeorm-customer.repository.spec.ts typeorm-invoice.repository.spec.ts
~~~

Expected: FAIL because the new method signatures and manager branches do not exist.

- [ ] Step 3: Add the optional manager signatures

Update both repository ports with the exact signatures above. Preserve all existing methods and import EntityManager as a type.

- [ ] Step 4: Implement tenant-scoped manager queries

In each repository, use the manager repository with { organizationId: this.tenantContext.getOrganizationId(), ...criteria } when a manager is provided. Keep the existing BaseRepository path when it is not.

Update the explicit domain-to-ORM mappers where needed. Do not cast a domain object to an ORM entity.

- [ ] Step 5: Add the unique invoice index

Replace the single-column organization index on InvoiceOrmEntity with:

~~~typescript
@Index(['organizationId', 'invoiceNumber'], { unique: true })
~~~

Keep the entity column as varchar. The pre-insert lookup remains for a friendly row error; the database index is the concurrency guard.

- [ ] Step 6: Write a failing transaction propagation test

Add a CreateReceivableUseCase test proving that:

1. execute(input) opens one DataSource.transaction().
2. execute(input, manager) does not open another transaction.
3. Customer validation, plan-limit enforcement, and repository save all receive the supplied manager.

- [ ] Step 7: Make CreateReceivableUseCase manager-aware

Refactor the current implementation into one transaction body:

~~~typescript
async execute(input: CreateReceivableInput, manager?: EntityManager): Promise<Receivable> {
  if (manager) return this.createWithinTransaction(input, manager);
  return this.dataSource.transaction((transactionManager) =>
    this.createWithinTransaction(input, transactionManager),
  );
}
~~~

createWithinTransaction must validate the customer with findById(input.customerId, manager), enforce the plan limit with the same manager, construct the Receivable, and save it with the same manager. Existing callers remain unchanged.

- [ ] Step 8: Run focused tests and type-check

Run:

~~~bash
pnpm --filter @casso-ledger/backend test typeorm-customer.repository.spec.ts typeorm-invoice.repository.spec.ts create-receivable.usecase.spec.ts
pnpm --filter @casso-ledger/backend type-check
~~~

Expected: PASS.

- [ ] Step 9: Commit

~~~bash
git add apps/backend/src/modules/customers apps/backend/src/modules/invoices apps/backend/src/modules/receivables/application/create-receivable.usecase.ts
git commit -m "feat: make invoice import writes transaction-safe"
~~~

---

### Task 2: Parse and validate one invoice row, including tax

Files:

- Create invoice-row-parser.ts and its spec.

Interface:

~~~typescript
export interface ParsedInvoiceRow {
  customerName: string;
  customerTaxCode: string | null;
  customerEmail: string | null;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  totalAmount: number;
  taxAmount: number;
}

export function parseInvoiceRow(row: Record<string, unknown>): ParsedInvoiceRow;
~~~

- [ ] Step 1: Write failing parser tests

Cover:

- valid row with numeric amount and tax;
- valid row with digit-string amount and tax;
- blank optional identifiers and blank tax becoming null, null, and 0;
- missing customer name;
- blank invoice number;
- missing, zero, negative, decimal, comma-formatted, currency-formatted, and scientific-notation totalAmount;
- negative, decimal, comma-formatted, and tax-greater-than-total taxAmount;
- strict ISO date strings;
- JavaScript Date cells;
- invalid leap day and malformed dates;
- dueDate before issueDate;
- trimming and email lowercasing.

Example:

~~~typescript
it('rejects tax greater than total', () => {
  expect(() =>
    parseInvoiceRow({ ...validRow, totalAmount: '1000', taxAmount: '1001' }),
  ).toThrow('taxAmount must be between 0 and totalAmount');
});
~~~

- [ ] Step 2: Run the parser test and verify failure

Run:

~~~bash
pnpm --filter @casso-ledger/backend test invoice-row-parser.spec.ts
~~~

Expected: FAIL because the module does not exist.

- [ ] Step 3: Implement the smallest pure parser

Use AppError with ErrorCode.VALIDATION_ERROR for row validation failures. Do not import NestJS or TypeORM.

For dates, accept a JavaScript Date only when valid. For strings, require /^\d{4}-\d{2}-\d{2}$/, construct UTC midnight with Date.UTC, and verify the year/month/day round-trip so invalid dates such as 2026-02-29 are rejected. No new date library is needed.

For amounts, accept a number only when Number.isSafeInteger(value), or a trimmed digit-only string that converts to a safe integer. Reject all other forms. Tax may be zero; total must be positive.

- [ ] Step 4: Run parser tests

Run:

~~~bash
pnpm --filter @casso-ledger/backend test invoice-row-parser.spec.ts
~~~

Expected: all parser tests PASS.

- [ ] Step 5: Commit

~~~bash
git add apps/backend/src/modules/invoice-import/application/invoice-row-parser.ts apps/backend/src/modules/invoice-import/application/invoice-row-parser.spec.ts
git commit -m "feat: validate imported invoice rows and tax"
~~~

---

### Task 3: Parse files, validate headers, and enforce import limits

Files:

- Create file-row-parser.ts and its spec.
- Modify apps/backend/package.json with runtime dependencies xlsx and csv-parse.

Interface:

~~~typescript
export const IMPORT_HEADERS = [
  'customerName',
  'customerTaxCode',
  'customerEmail',
  'invoiceNumber',
  'issueDate',
  'dueDate',
  'totalAmount',
  'taxAmount',
] as const;

export interface ParsedImportFile {
  rows: Record<string, unknown>[];
  totalRows: number;
}

export function parseFileToRows(
  buffer: Buffer,
  originalFilename: string,
): ParsedImportFile;
~~~

- [ ] Step 1: Add the existing-parser dependencies

Run:

~~~bash
pnpm --filter @casso-ledger/backend add xlsx csv-parse
~~~

- [ ] Step 2: Write failing file-parser tests

Cover:

- .xlsx rows from the first sheet;
- .xls rows from the first sheet;
- CSV with UTF-8 BOM and comma delimiter;
- extra headers being ignored;
- missing header being rejected;
- duplicate header being rejected;
- exact header casing being required;
- empty data file being rejected;
- unsupported extension being rejected;
- malformed workbook/CSV being rejected;
- more than 1,000 data rows being rejected;
- a second workbook sheet being ignored.

- [ ] Step 3: Run the file-parser tests and verify failure

Run:

~~~bash
pnpm --filter @casso-ledger/backend test file-row-parser.spec.ts
~~~

Expected: FAIL because the module does not exist.

- [ ] Step 4: Implement extension dispatch

For CSV, call csv-parse/sync with columns: true, bom: true, delimiter: ',', skip_empty_lines: true, trim: true, and strict column counts.

For Excel, read the first sheet with cellDates: true, extract the first row as headers, validate it, and map subsequent rows by header index. Ignore columns not in IMPORT_HEADERS.

Normalize a BOM only on the first header cell, preserve cell Date values, and return plain row objects. Throw AppError(ErrorCode.VALIDATION_ERROR, ...) for unsupported extension, malformed content, missing/duplicate headers, empty data, or more than 1,000 rows.

- [ ] Step 5: Run file-parser tests

Run:

~~~bash
pnpm --filter @casso-ledger/backend test file-row-parser.spec.ts
~~~

Expected: PASS.

- [ ] Step 6: Commit

~~~bash
git add apps/backend/src/modules/invoice-import/infrastructure apps/backend/package.json pnpm-lock.yaml
git commit -m "feat: parse invoice import files with fixed headers"
~~~

---

### Task 4: Orchestrate partial import with customer resolution, idempotency fingerprint, and audit

Files:

- Create import-request-fingerprint.ts, import-invoices.usecase.ts, and their specs.
- Modify apps/backend/src/common/audit/audit.enums.ts.

Interfaces:

~~~typescript
export function getImportRequestFingerprint(
  buffer: Buffer,
  filename: string,
): string;

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

ImportInvoicesUseCase.execute(
  buffer: Buffer,
  filename: string,
): Promise<ImportInvoicesResult>;
~~~

- [ ] Step 1: Add audit enum values

Add INVOICE_IMPORT to both AuditActionType and AuditEntityType. Use the SHA-256 fingerprint as the audit entityId.

- [ ] Step 2: Write failing use-case tests

Use Jest mocks for repositories, DataSource, EntityManager, CreateReceivableUseCase, and the audit repository. Cover:

- one valid row creates Customer, Invoice, and Receivable;
- taxAmount is persisted on Invoice and totalAmount is passed to Receivable;
- tax/email match resolution and lowercased email;
- tax/email mismatch returns CUSTOMER_MISMATCH;
- name-only rows create a Customer;
- duplicate invoice numbers return DUPLICATE_INVOICE_NUMBER;
- valid rows continue after validation, duplicate, mismatch, quota, and unexpected failures;
- every valid row gets its own transaction;
- the same manager reaches customer lookup/save, invoice lookup/save, plan enforcement, and receivable creation;
- unexpected errors become IMPORT_ROW_FAILED and do not expose the original error;
- one metadata-only audit record is created with filename, hash, counts, and actor;
- audit failure does not change a successful import result.

- [ ] Step 3: Run the use-case tests and verify failure

Run:

~~~bash
pnpm --filter @casso-ledger/backend test import-invoices.usecase.spec.ts
~~~

Expected: FAIL because the module does not exist.

- [ ] Step 4: Implement the fingerprint helper

Hash the filename and bytes with Node's standard library:

~~~typescript
import { createHash } from 'node:crypto';

export function getImportRequestFingerprint(buffer: Buffer, filename: string): string {
  return createHash('sha256')
    .update(filename)
    .update('\0')
    .update(buffer)
    .digest('hex');
}
~~~

- [ ] Step 5: Implement the sequential row loop

Call parseFileToRows, compute fileSha256 with getImportRequestFingerprint, then process rows in array order. The first data row is row number 2.

The constructor injects CUSTOMER_REPOSITORY, INVOICE_REPOSITORY, CreateReceivableUseCase, TenantContextService, DataSource, and AUDIT_LOG_REPOSITORY. Use Nest Logger for structured row and audit failure logs.

For each row:

1. Parse with parseInvoiceRow outside the transaction.
2. Run one dataSource.transaction(async (manager) => ...).
3. Look up an existing invoice by invoice number with the manager.
4. Resolve by normalized tax code, then normalized email. If both matches exist and IDs differ, throw AppError(ErrorCode.CUSTOMER_MISMATCH, ...).
5. Create a Customer with taxCode/email set to empty strings when absent, phone: '', defaultPaymentTermDays: 30, creditLimit: 0, priority: 1, and the current organization.
6. Save Invoice with sourceType: IMPORT, status: InvoiceStatus.ISSUED, taxAmount from the row, fileUrl: null, and the current organization.
7. Call createReceivableUseCase.execute({ customerId, invoiceId, originalAmount: totalAmount, dueDate, salesRepresentativeId: currentUser.userId }, manager).

Catch only at the row boundary. Convert expected AppError values to stable row errors; convert all other errors to IMPORT_ROW_FAILED, log them with row number, invoice number, organization ID, and user ID, and continue.

- [ ] Step 6: Record one metadata-only audit

After the row loop, create an AuditLog with:

~~~typescript
{
  organizationId,
  userId,
  actionType: AuditActionType.INVOICE_IMPORT,
  entityType: AuditEntityType.INVOICE_IMPORT,
  entityId: fileSha256,
  beforeState: null,
  afterState: {
    filename,
    fileSha256,
    totalRows,
    successCount,
    failedCount: failedRows.length,
  },
  ipAddress: null,
  createdAt: new Date(),
}
~~~

Send this audit write fire-and-forget with structured error logging so an audit outage cannot turn a successful import into HTTP 500.

- [ ] Step 7: Run use-case tests

Run:

~~~bash
pnpm --filter @casso-ledger/backend test import-invoices.usecase.spec.ts
~~~

Expected: PASS.

- [ ] Step 8: Commit

~~~bash
git add apps/backend/src/modules/invoice-import/application apps/backend/src/common/audit/audit.enums.ts
git commit -m "feat: orchestrate partial invoice imports"
~~~

---

### Task 5: Add the multipart endpoint, idempotency, permission, and module wiring

Files:

- Create invoice-import.controller.ts, invoice-import.controller.spec.ts, and invoice-import.module.ts.
- Modify apps/backend/src/app.module.ts and apps/backend/package.json.
- Add @types/multer as a backend dev dependency for the Express.Multer.File type.

Interface:

~~~http
POST /api/v1/invoices/import
Authorization: Bearer <access-token>
Idempotency-Key: <client-generated-key>
Content-Type: multipart/form-data
file: <xlsx|xls|csv>
~~~

Successful response:

~~~json
{
  "totalRows": 2,
  "successCount": 1,
  "failedRows": [
    {
      "rowNumber": 3,
      "data": { "invoiceNumber": "INV-2" },
      "errors": ["VALIDATION_ERROR"]
    }
  ]
}
~~~

- [ ] Step 1: Write failing controller/module tests

Cover:

- missing file returns standard 400 validation envelope;
- missing idempotency key is rejected by IdempotencyService;
- RECEIVABLE_IMPORT is required;
- the file-size limit is configured at 5 MiB;
- idempotency receives endpoint POST /invoices/import and { filename, fileSha256 };
- a valid request returns the use-case result with HTTP 201.

- [ ] Step 2: Run focused tests and verify failure

Run:

~~~bash
pnpm --filter @casso-ledger/backend test invoice-import.controller.spec.ts
~~~

Expected: FAIL because the controller and module do not exist.

- [ ] Step 3: Add the multipart type declarations

Run:

~~~bash
pnpm --filter @casso-ledger/backend add -D @types/multer
~~~

- [ ] Step 4: Implement the controller

Import BadRequestException from @nestjs/common, FileInterceptor and memoryStorage from @nestjs/platform-express, and use the established controller pattern:

~~~typescript
@Controller('invoices')
@UseGuards(PermissionGuard)
export class InvoiceImportController {
  @Post('import')
  @RequirePermission(Permission.RECEIVABLE_IMPORT)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async import(
    @Headers('idempotency-key') key: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ImportInvoicesResult> {
    if (!file) throw new BadRequestException('File là bắt buộc.');
    const fileSha256 = getImportRequestFingerprint(file.buffer, file.originalname);
    return this.idempotency.execute(
      'POST /invoices/import',
      key,
      { filename: file.originalname, fileSha256 },
      () => this.importInvoicesUseCase.execute(file.buffer, file.originalname),
    );
  }
}
~~~

Do not add @Audited to this method; the use case writes the metadata-only audit so row data never enters the interceptor's after-state.

- [ ] Step 5: Wire the module

Import CustomersModule, InvoicesModule, ReceivablesModule, and IdempotencyModule. Provide ImportInvoicesUseCase, expose the controller, and register InvoiceImportModule in AppModule.

Use the existing global AuditModule; do not create a second audit adapter.

- [ ] Step 6: Run focused tests and type-check

Run:

~~~bash
pnpm --filter @casso-ledger/backend test invoice-import.controller.spec.ts
pnpm --filter @casso-ledger/backend type-check
~~~

Expected: PASS.

- [ ] Step 7: Commit

~~~bash
git add apps/backend/src/modules/invoice-import apps/backend/src/app.module.ts apps/backend/package.json pnpm-lock.yaml
git commit -m "feat: expose idempotent invoice import endpoint"
~~~

---

### Task 6: Prove the complete flow against PostgreSQL

Files:

- Create apps/backend/test/invoice-import.e2e-spec.ts.

Test setup:

Use the existing Testcontainers pattern from read-apis-completion.e2e-spec.ts: PostgreSQL 16, AppModule, configureApp(app), synchronize: true, an OWNER membership, and an authenticated JWT.

- [ ] Step 1: Write the integration tests before implementation is considered complete

The suite must cover:

1. .xlsx with one valid row and one invalid amount row returns 201, creates exactly one Invoice and one Receivable, and reports the invalid row as row 3.
2. The valid row persists totalAmount and taxAmount, and the Receivable original amount equals gross total.
3. .csv with UTF-8 BOM works.
4. Existing customer resolution by tax code and email reuses the same Customer.
5. Tax/email mismatch creates no Invoice or Receivable for that row.
6. Name-only input creates a Customer.
7. Existing and same-file duplicate invoice numbers are rejected.
8. The database unique index exists for (organizationId, invoiceNumber).
9. Missing file, malformed file, missing header, empty file, unsupported extension, and 1,001 rows return 400 with the standard error envelope; a 5 MiB overflow returns 413 Payload Too Large.
10. A second workbook sheet is not imported.
11. A SALES_REP import assigns the created Receivable to the authenticated user.
12. A repeated request with the same idempotency key returns the cached result and leaves row counts unchanged.
13. Reusing the same key with a different file returns IDEMPOTENCY_KEY_REUSED.
14. One metadata-only INVOICE_IMPORT audit row is written and contains no raw row data.
15. A second organization cannot affect or read the first organization's imported rows.

- [ ] Step 2: Run the focused integration suite

Run:

~~~bash
pnpm --filter @casso-ledger/backend test:e2e -- invoice-import.e2e-spec.ts
~~~

Expected: all scenarios PASS against real PostgreSQL.

- [ ] Step 3: Commit

~~~bash
git add apps/backend/test/invoice-import.e2e-spec.ts
git commit -m "test: verify invoice import end to end"
~~~

---

### Task 7: Final verification and map update

- [ ] Step 1: Run the focused unit suite

Run:

~~~bash
pnpm --filter @casso-ledger/backend test invoice-row-parser.spec.ts file-row-parser.spec.ts import-invoices.usecase.spec.ts invoice-import.controller.spec.ts
~~~

- [ ] Step 2: Run the backend suite and type-check

Run:

~~~bash
pnpm --filter @casso-ledger/backend test
pnpm --filter @casso-ledger/backend type-check
~~~

- [ ] Step 3: Run integration tests

Run:

~~~bash
pnpm --filter @casso-ledger/backend test:e2e -- invoice-import.e2e-spec.ts
~~~

If Testcontainers is unavailable, report that exact blocker; do not claim the integration path is verified.

- [ ] Step 4: Run repository verification and domain checks

Run:

~~~bash
pnpm verify
~~~

Run the repository's /domain-check procedure from .claude/skills/domain-check.md and fix every violation before completion.

- [ ] Step 5: Update the feature map

After all checks pass, change Plan #14 to done, add the shipped date and PR reference, and update the Frontier/blocked-ticket sections if Plan #20's blocker list changes.

- [ ] Step 6: Commit the documentation update

~~~bash
git add docs/wayfinder/feature-map.md docs/superpowers/plans/2026-08-03-invoice-import.md
git commit -m "docs: finalize invoice import implementation plan"
~~~

## Self-Review

- Spec flow is covered by Tasks 2–6: fixed headers, Excel/CSV parsing, row validation, customer resolution, duplicate protection, Customer + Invoice + Receivable creation, partial results, and multipart endpoint.
- The agreed tax extension is covered by Task 2, Task 4, and integration scenario 2.
- The agreed operational safeguards are covered by Task 3 and Task 5: 5 MiB, 1,000 rows, sequential processing, idempotency, and generic unexpected-row errors.
- The agreed concurrency safeguard is covered by Task 1's manager propagation and unique composite index.
- Tenant isolation is covered by manager-scoped repository queries and integration scenario 15.
- No new queue, column-mapping UI, ERP connector, tax-rate model, or customer createdVia field is introduced.
- The existing plan's stale assumptions are deliberately corrected: current repository mappers are preserved, current CreateReceivableUseCase is made manager-aware, imports use node:crypto, and no as any/as unknown as casts are added.
