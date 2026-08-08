import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import request from 'supertest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { DataSource } from 'typeorm';
import * as XLSX from 'xlsx';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { getImportRequestFingerprint } from '../src/modules/invoice-import/application/import-request-fingerprint';
import { InvoiceStatus } from '../src/modules/invoices/domain/invoice';
import { InvoiceOrmEntity } from '../src/modules/invoices/infrastructure/invoice.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

describe('Invoice import (integration)', () => {
  let pgContainer: StartedPostgreSqlContainer;
  let redisContainer: StartedTestContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  const orgA = '00000000-0000-0000-0000-00000000020a';
  const orgB = '00000000-0000-0000-0000-00000000020b';
  const ownerA = '00000000-0000-0000-0000-0000000020a1';
  const salesRepA = '00000000-0000-0000-0000-0000000020a2';
  const ownerB = '00000000-0000-0000-0000-0000000020b1';

  beforeAll(async () => {
    [pgContainer, redisContainer] = await Promise.all([
      new PostgreSqlContainer('postgres:16').start(),
      new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
    ]);
    process.env.DB_HOST = pgContainer.getHost();
    process.env.DB_PORT = String(pgContainer.getMappedPort(5432));
    process.env.DB_USERNAME = pgContainer.getUsername();
    process.env.DB_PASSWORD = pgContainer.getPassword();
    process.env.DB_DATABASE = pgContainer.getDatabase();
    process.env.REDIS_HOST = redisContainer.getHost();
    process.env.REDIS_PORT = String(redisContainer.getMappedPort(6379));
    process.env.JWT_SECRET = 'invoice-import-e2e-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'e2e-resend-key';
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'e2e-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'e2e-secret';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);

    await dataSource.getRepository(UserOrmEntity).save([
      {
        id: ownerA,
        name: 'Org A Owner',
        email: 'owner-a-import@example.com',
        passwordHash: 'test-hash',
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: salesRepA,
        name: 'Org A Sales Rep',
        email: 'sales-a-import@example.com',
        passwordHash: 'test-hash',
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: ownerB,
        name: 'Org B Owner',
        email: 'owner-b-import@example.com',
        passwordHash: 'test-hash',
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
      },
    ]);

    await dataSource.getRepository(MembershipOrmEntity).save([
      {
        organizationId: orgA,
        userId: ownerA,
        role: Role.OWNER,
        invitedAt: new Date(),
        joinedAt: new Date(),
        createdAt: new Date(),
      },
      {
        organizationId: orgA,
        userId: salesRepA,
        role: Role.SALES_REP,
        invitedAt: new Date(),
        joinedAt: new Date(),
        createdAt: new Date(),
      },
      {
        organizationId: orgB,
        userId: ownerB,
        role: Role.OWNER,
        invitedAt: new Date(),
        joinedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await redisContainer?.stop();
    await pgContainer?.stop();
  });

  function tokenFor(userId: string, organizationId: string, role: Role) {
    return jwtService.sign({ userId, organizationId, role });
  }

  function makeXlsx(rows: Record<string, unknown>[]) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  function makeXlsxMultiSheet(
    sheet1: Record<string, unknown>[],
    sheet2: Record<string, unknown>[],
  ) {
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(sheet1);
    const ws2 = XLSX.utils.json_to_sheet(sheet2);
    XLSX.utils.book_append_sheet(wb, ws1, 'Sheet1');
    XLSX.utils.book_append_sheet(wb, ws2, 'Sheet2');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  function makeCsv(header: string, rows: string[][]): Buffer {
    const lines = [header, ...rows.map((r) => r.join(','))];
    return Buffer.from(lines.join('\n'));
  }

  function expectStandardErrorEnvelope(
    body: unknown,
    statusCode: number,
    errorCode = 'VALIDATION_ERROR',
  ): void {
    expect(body).toEqual(
      expect.objectContaining({
        statusCode,
        errorCode,
        message: expect.any(String),
      }),
    );
  }

  const VALID_HEADER =
    'customerName,customerTaxCode,customerEmail,invoiceNumber,issueDate,dueDate,totalAmount,taxAmount';

  const VALID_ROW = [
    'Acme Corp',
    '12345',
    'acme@test.com',
    'INV-001',
    '2026-08-01',
    '2026-09-01',
    '1000000',
    '100000',
  ];

  it('1. .xlsx with valid+invalid row returns 201, creates Invoice+Receivable for valid row, reports invalid row', async () => {
    const token = tokenFor(ownerA, orgA, Role.OWNER);
    const buffer = makeXlsx([
      {
        customerName: 'Acme Corp',
        customerTaxCode: '12345',
        customerEmail: 'acme@test.com',
        invoiceNumber: 'INV-X001',
        issueDate: '2026-08-01',
        dueDate: '2026-09-01',
        totalAmount: 1000000,
        taxAmount: 100000,
      },
      {
        customerName: 'Bad Corp',
        customerTaxCode: '99999',
        customerEmail: 'bad@test.com',
        invoiceNumber: 'INV-X002',
        issueDate: '2026-08-01',
        dueDate: '2026-09-01',
        totalAmount: 'abc',
        taxAmount: 0,
      },
    ]);

    const res = await request(app.getHttpServer())
      .post('/api/v1/invoices/import')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .attach('file', buffer, { filename: 'test.xlsx' })
      .expect(201);

    expect(res.body.totalRows).toBe(2);
    expect(res.body.successCount).toBe(1);
    expect(res.body.failedRows).toHaveLength(1);
    expect(res.body.failedRows[0].rowNumber).toBe(3);

    const invCount = await dataSource
      .getRepository(InvoiceOrmEntity)
      .count({ where: { organizationId: orgA, sourceType: 'IMPORT' } });
    expect(invCount).toBe(1);

    const recCount = await dataSource
      .getRepository(ReceivableOrmEntity)
      .count({ where: { organizationId: orgA } });
    expect(recCount).toBe(1);
  });

  it('2. totalAmount/taxAmount are persisted; Receivable.originalAmount = gross total', async () => {
    const invNum = `INV-A-${randomUUID().slice(0, 8)}`;
    const token = tokenFor(ownerA, orgA, Role.OWNER);
    const buffer = makeXlsx([
      {
        customerName: 'Persist Corp',
        customerTaxCode: 'PERSIST',
        customerEmail: 'persist@test.com',
        invoiceNumber: invNum,
        issueDate: '2026-08-01',
        dueDate: '2026-09-01',
        totalAmount: 5000000,
        taxAmount: 500000,
      },
    ]);

    await request(app.getHttpServer())
      .post('/api/v1/invoices/import')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .attach('file', buffer, { filename: 'test.xlsx' })
      .expect(201);

    const inv = await dataSource.getRepository(InvoiceOrmEntity).findOne({
      where: { organizationId: orgA, invoiceNumber: invNum },
    });
    expect(inv).toBeDefined();
    // ponytail: TypeORM returns bigint columns as strings
    expect(Number(inv!.totalAmount)).toBe(5000000);
    expect(Number(inv!.taxAmount)).toBe(500000);

    const rec = await dataSource.getRepository(ReceivableOrmEntity).findOne({
      where: { organizationId: orgA, invoiceId: inv!.id },
    });
    expect(rec).toBeDefined();
    expect(Number(rec!.originalAmount)).toBe(5000000);
  });

  it('3. CSV with UTF-8 BOM works', async () => {
    const invNum = `INV-BOM-${randomUUID().slice(0, 8)}`;
    const token = tokenFor(ownerA, orgA, Role.OWNER);
    const csvBody = `${VALID_HEADER}\nBOM Corp,,,${invNum},2026-08-01,2026-09-01,3000000,300000`;
    const buffer = Buffer.from(`\uFEFF${csvBody}`);

    const res = await request(app.getHttpServer())
      .post('/api/v1/invoices/import')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .attach('file', buffer, { filename: 'bom.csv' })
      .expect(201);

    expect(res.body.successCount).toBe(1);

    const inv = await dataSource.getRepository(InvoiceOrmEntity).findOne({
      where: { organizationId: orgA, invoiceNumber: invNum },
    });
    expect(inv).toBeDefined();
  });

  it('4. Existing customer matched by tax code/email and reused', async () => {
    const existingTax = `TAX-${randomUUID().slice(0, 6)}`;
    const existingEmail = `reuse-${randomUUID().slice(0, 6)}@test.com`;
    const custId = randomUUID();

    await dataSource.getRepository(CustomerOrmEntity).save({
      id: custId,
      organizationId: orgA,
      name: 'Existing Customer',
      taxCode: existingTax,
      email: existingEmail,
      phone: '',
      defaultPaymentTermDays: 30,
      creditLimit: 0,
      priority: 1,
      createdAt: new Date(),
    });

    const invNum = `INV-REUSE-${randomUUID().slice(0, 6)}`;
    const token = tokenFor(ownerA, orgA, Role.OWNER);
    const buffer = makeXlsx([
      {
        customerName: 'Should Be Ignored',
        customerTaxCode: existingTax,
        customerEmail: existingEmail,
        invoiceNumber: invNum,
        issueDate: '2026-08-01',
        dueDate: '2026-09-01',
        totalAmount: 4000000,
        taxAmount: 400000,
      },
    ]);

    await request(app.getHttpServer())
      .post('/api/v1/invoices/import')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .attach('file', buffer, { filename: 'test.xlsx' })
      .expect(201);

    const inv = await dataSource.getRepository(InvoiceOrmEntity).findOne({
      where: { organizationId: orgA, invoiceNumber: invNum },
    });
    expect(inv).toBeDefined();
    expect(inv!.customerId).toBe(custId);

    const custCount = await dataSource
      .getRepository(CustomerOrmEntity)
      .count({ where: { organizationId: orgA, taxCode: existingTax } });
    expect(custCount).toBe(1);
  });

  it('5. Tax/email mismatch creates no Invoice or Receivable for that row', async () => {
    const taxA = `TAXA-${randomUUID().slice(0, 6)}`;
    const taxB = `TAXB-${randomUUID().slice(0, 6)}`;
    const emailA = `emaila-${randomUUID().slice(0, 6)}@test.com`;
    const emailB = `emailb-${randomUUID().slice(0, 6)}@test.com`;

    await dataSource.getRepository(CustomerOrmEntity).save([
      {
        id: randomUUID(),
        organizationId: orgA,
        name: 'Cust A',
        taxCode: taxA,
        email: emailA,
        phone: '',
        defaultPaymentTermDays: 30,
        creditLimit: 0,
        priority: 1,
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        organizationId: orgA,
        name: 'Cust B',
        taxCode: taxB,
        email: emailB,
        phone: '',
        defaultPaymentTermDays: 30,
        creditLimit: 0,
        priority: 1,
        createdAt: new Date(),
      },
    ]);

    const invNum = `INV-MISMATCH-${randomUUID().slice(0, 6)}`;
    const token = tokenFor(ownerA, orgA, Role.OWNER);
    const buffer = makeXlsx([
      {
        customerName: 'Mismatched',
        customerTaxCode: taxA,
        customerEmail: emailB,
        invoiceNumber: invNum,
        issueDate: '2026-08-01',
        dueDate: '2026-09-01',
        totalAmount: 1000000,
        taxAmount: 0,
      },
    ]);

    const res = await request(app.getHttpServer())
      .post('/api/v1/invoices/import')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .attach('file', buffer, { filename: 'test.xlsx' })
      .expect(201);

    expect(res.body.successCount).toBe(0);
    expect(res.body.failedRows).toHaveLength(1);
    expect(res.body.failedRows[0].errors).toContain('CUSTOMER_MISMATCH');

    const inv = await dataSource.getRepository(InvoiceOrmEntity).findOne({
      where: { organizationId: orgA, invoiceNumber: invNum },
    });
    expect(inv).toBeNull();
  });

  it('6. Name-only row creates a Customer', async () => {
    const invNum = `INV-CUST-${randomUUID().slice(0, 6)}`;
    const token = tokenFor(ownerA, orgA, Role.OWNER);
    const buffer = makeXlsx([
      {
        customerName: 'New Customer Only',
        customerTaxCode: '',
        customerEmail: '',
        invoiceNumber: invNum,
        issueDate: '2026-08-01',
        dueDate: '2026-09-01',
        totalAmount: 1000000,
        taxAmount: 0,
      },
    ]);

    await request(app.getHttpServer())
      .post('/api/v1/invoices/import')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .attach('file', buffer, { filename: 'test.xlsx' })
      .expect(201);

    const cust = await dataSource
      .getRepository(CustomerOrmEntity)
      .createQueryBuilder('c')
      .where('c."organizationId" = :org AND c.name = :name', {
        org: orgA,
        name: 'New Customer Only',
      })
      .getOne();
    expect(cust).toBeDefined();
    expect(cust!.taxCode).toBe('');
    expect(cust!.email).toBe('');
  });

  it('7. Duplicate invoice number (existing + same-file) are rejected', async () => {
    const existingInv = `INV-DUP-${randomUUID().slice(0, 6)}`;
    const token = tokenFor(ownerA, orgA, Role.OWNER);

    await dataSource.getRepository(InvoiceOrmEntity).save({
      id: randomUUID(),
      organizationId: orgA,
      customerId: '00000000-0000-0000-0000-000000000001',
      invoiceNumber: existingInv,
      issueDate: new Date('2026-01-01'),
      totalAmount: 1000000,
      taxAmount: 0,
      sourceType: 'MANUAL',
      fileUrl: null,
      status: InvoiceStatus.ISSUED,
      createdAt: new Date(),
    });

    const sameFileInv = `INV-DUP-${randomUUID().slice(0, 6)}`;
    const buffer = makeXlsx([
      {
        customerName: 'Dup Test',
        customerTaxCode: '',
        customerEmail: '',
        invoiceNumber: existingInv,
        issueDate: '2026-08-01',
        dueDate: '2026-09-01',
        totalAmount: 1000000,
        taxAmount: 0,
      },
      {
        customerName: 'Dup Test 2',
        customerTaxCode: '',
        customerEmail: '',
        invoiceNumber: sameFileInv,
        issueDate: '2026-08-01',
        dueDate: '2026-09-01',
        totalAmount: 2000000,
        taxAmount: 0,
      },
      {
        customerName: 'Dup Test 3',
        customerTaxCode: '',
        customerEmail: '',
        invoiceNumber: sameFileInv,
        issueDate: '2026-08-01',
        dueDate: '2026-09-01',
        totalAmount: 3000000,
        taxAmount: 0,
      },
    ]);

    const res = await request(app.getHttpServer())
      .post('/api/v1/invoices/import')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .attach('file', buffer, { filename: 'test.xlsx' })
      .expect(201);

    expect(res.body.successCount).toBe(1);
    expect(res.body.failedRows).toHaveLength(2);
    for (const f of res.body.failedRows) {
      expect(f.errors).toContain('DUPLICATE_INVOICE_NUMBER');
    }
  });

  it('7b. Concurrent imports return a stable duplicate row failure', async () => {
    const invoiceNumber = `INV-RACE-${randomUUID().slice(0, 6)}`;
    const token = tokenFor(ownerA, orgA, Role.OWNER);
    const buffer = makeXlsx([
      {
        customerName: 'Race Customer',
        customerTaxCode: '',
        customerEmail: '',
        invoiceNumber,
        issueDate: '2026-08-01',
        dueDate: '2026-09-01',
        totalAmount: 1000000,
        taxAmount: 0,
      },
    ]);

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/invoices/import')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .attach('file', buffer, { filename: 'race-a.xlsx' }),
      request(app.getHttpServer())
        .post('/api/v1/invoices/import')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .attach('file', buffer, { filename: 'race-b.xlsx' }),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect([first.body.successCount, second.body.successCount].sort()).toEqual([
      0, 1,
    ]);
    const failedResult = [first.body, second.body].find(
      (body) => body.successCount === 0,
    );
    expect(failedResult?.failedRows).toEqual([
      expect.objectContaining({ errors: ['DUPLICATE_INVOICE_NUMBER'] }),
    ]);
  });

  it('8. DB unique index (organizationId, invoiceNumber) exists', async () => {
    const result = await dataSource.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'invoices'
        AND indexdef LIKE '%organizationId%invoiceNumber%'
        AND indexdef LIKE '%UNIQUE%'
    `);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('9a. Missing file returns 400', async () => {
    const token = tokenFor(ownerA, orgA, Role.OWNER);
    const res = await request(app.getHttpServer())
      .post('/api/v1/invoices/import')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID());
    expect(res.status).toBe(400);
    expectStandardErrorEnvelope(res.body, 400);
  });

  it('9b. Malformed file returns 400', async () => {
    const token = tokenFor(ownerA, orgA, Role.OWNER);
    const buffer = Buffer.from('not a real excel file');
    const res = await request(app.getHttpServer())
      .post('/api/v1/invoices/import')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .attach('file', buffer, { filename: 'bad.xlsx' });
    expect(res.status).toBe(400);
    expectStandardErrorEnvelope(res.body, 400);
  });

  it('9c. Missing header returns 400', async () => {
    const token = tokenFor(ownerA, orgA, Role.OWNER);
    const buffer = makeCsv('customerName,customerTaxCode', [['Foo', '123']]);
    const res = await request(app.getHttpServer())
      .post('/api/v1/invoices/import')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .attach('file', buffer, { filename: 'no-header.csv' });
    expect(res.status).toBe(400);
    expectStandardErrorEnvelope(res.body, 400);
  });

  it('9d. Empty data file returns 400', async () => {
    const token = tokenFor(ownerA, orgA, Role.OWNER);
    const buffer = makeCsv(VALID_HEADER, []);
    const res = await request(app.getHttpServer())
      .post('/api/v1/invoices/import')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .attach('file', buffer, { filename: 'empty.csv' });
    expect(res.status).toBe(400);
    expectStandardErrorEnvelope(res.body, 400);
  });

  it('9e. Unsupported extension returns 400', async () => {
    const token = tokenFor(ownerA, orgA, Role.OWNER);
    const buffer = makeCsv(VALID_HEADER, [VALID_ROW]);
    const res = await request(app.getHttpServer())
      .post('/api/v1/invoices/import')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .attach('file', buffer, { filename: 'data.pdf' });
    expect(res.status).toBe(400);
    expectStandardErrorEnvelope(res.body, 400);
  });

  it('9f. File > 5 MiB returns 413 Payload Too Large', async () => {
    const token = tokenFor(ownerA, orgA, Role.OWNER);
    const bigBuffer = Buffer.alloc(5 * 1024 * 1024 + 1, 0);
    const res = await request(app.getHttpServer())
      .post('/api/v1/invoices/import')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .attach('file', bigBuffer, { filename: 'big.xlsx' });
    expect(res.status).toBe(413);
    expectStandardErrorEnvelope(res.body, 413, 'FILE_TOO_LARGE');
  });

  it('9g. 1,001 rows returns 400', async () => {
    const token = tokenFor(ownerA, orgA, Role.OWNER);
    const rows = Array.from({ length: 1001 }, (_, i) => ({
      customerName: `Customer ${i}`,
      customerTaxCode: '',
      customerEmail: '',
      invoiceNumber: `INV-1K-${i}`,
      issueDate: '2026-08-01',
      dueDate: '2026-09-01',
      totalAmount: 1000000,
      taxAmount: 0,
    }));
    const buffer = makeXlsx(rows);
    const res = await request(app.getHttpServer())
      .post('/api/v1/invoices/import')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .attach('file', buffer, { filename: 'big.xlsx' });
    expect(res.status).toBe(400);
    expectStandardErrorEnvelope(res.body, 400);
  });

  it('10. Second workbook sheet is not imported', async () => {
    const token = tokenFor(ownerA, orgA, Role.OWNER);
    const invSheet2 = `INV-S2-${randomUUID().slice(0, 6)}`;
    const buffer = makeXlsxMultiSheet(
      [
        {
          customerName: 'Sheet1 Corp',
          customerTaxCode: '',
          customerEmail: '',
          invoiceNumber: `INV-S1-${randomUUID().slice(0, 6)}`,
          issueDate: '2026-08-01',
          dueDate: '2026-09-01',
          totalAmount: 1000000,
          taxAmount: 0,
        },
      ],
      [
        {
          customerName: 'Sheet2 Corp',
          customerTaxCode: '',
          customerEmail: '',
          invoiceNumber: invSheet2,
          issueDate: '2026-08-01',
          dueDate: '2026-09-01',
          totalAmount: 2000000,
          taxAmount: 0,
        },
      ],
    );

    const res = await request(app.getHttpServer())
      .post('/api/v1/invoices/import')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .attach('file', buffer, { filename: 'multi.xlsx' })
      .expect(201);

    expect(res.body.totalRows).toBe(1);
    expect(res.body.successCount).toBe(1);

    const invSheet2Exists = await dataSource
      .getRepository(InvoiceOrmEntity)
      .findOne({
        where: { organizationId: orgA, invoiceNumber: invSheet2 },
      });
    expect(invSheet2Exists).toBeNull();
  });

  it('11. SALES_REP import assigns Receivable to authenticated user', async () => {
    const invNum = `INV-SR-${randomUUID().slice(0, 6)}`;
    const token = tokenFor(salesRepA, orgA, Role.SALES_REP);
    const buffer = makeXlsx([
      {
        customerName: 'SR Customer',
        customerTaxCode: '',
        customerEmail: '',
        invoiceNumber: invNum,
        issueDate: '2026-08-01',
        dueDate: '2026-09-01',
        totalAmount: 1000000,
        taxAmount: 0,
      },
    ]);

    await request(app.getHttpServer())
      .post('/api/v1/invoices/import')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .attach('file', buffer, { filename: 'test.xlsx' })
      .expect(201);

    const inv = await dataSource.getRepository(InvoiceOrmEntity).findOne({
      where: { organizationId: orgA, invoiceNumber: invNum },
    });
    expect(inv).toBeDefined();

    const rec = await dataSource.getRepository(ReceivableOrmEntity).findOne({
      where: { organizationId: orgA, invoiceId: inv!.id },
    });
    expect(rec).toBeDefined();
    expect(rec!.salesRepresentativeId).toBe(salesRepA);
  });

  it('12. Same Idempotency-Key + same file returns cached result without increasing counts', async () => {
    const key = randomUUID();
    const invNum = `INV-IDEM-${randomUUID().slice(0, 6)}`;
    const token = tokenFor(ownerA, orgA, Role.OWNER);
    const buffer = makeXlsx([
      {
        customerName: 'Idem Corp',
        customerTaxCode: '',
        customerEmail: '',
        invoiceNumber: invNum,
        issueDate: '2026-08-01',
        dueDate: '2026-09-01',
        totalAmount: 1000000,
        taxAmount: 0,
      },
    ]);

    const res1 = await request(app.getHttpServer())
      .post('/api/v1/invoices/import')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .attach('file', buffer, { filename: 'test.xlsx' })
      .expect(201);

    const invCountBefore = await dataSource
      .getRepository(InvoiceOrmEntity)
      .count({ where: { organizationId: orgA, sourceType: 'IMPORT' } });

    const res2 = await request(app.getHttpServer())
      .post('/api/v1/invoices/import')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .attach('file', buffer, { filename: 'test.xlsx' })
      .expect(201);

    const invCountAfter = await dataSource
      .getRepository(InvoiceOrmEntity)
      .count({ where: { organizationId: orgA, sourceType: 'IMPORT' } });

    expect(res2.body).toEqual(res1.body);
    expect(invCountAfter).toBe(invCountBefore);
  });

  it('13. Reusing same key with different file returns IDEMPOTENCY_KEY_REUSED', async () => {
    const key = randomUUID();
    const token = tokenFor(ownerA, orgA, Role.OWNER);
    const buffer1 = makeXlsx([
      {
        customerName: 'Corp A',
        customerTaxCode: '',
        customerEmail: '',
        invoiceNumber: `INV-REUSE-A-${randomUUID().slice(0, 6)}`,
        issueDate: '2026-08-01',
        dueDate: '2026-09-01',
        totalAmount: 1000000,
        taxAmount: 0,
      },
    ]);
    const buffer2 = makeXlsx([
      {
        customerName: 'Corp B',
        customerTaxCode: '',
        customerEmail: '',
        invoiceNumber: `INV-REUSE-B-${randomUUID().slice(0, 6)}`,
        issueDate: '2026-08-01',
        dueDate: '2026-09-01',
        totalAmount: 2000000,
        taxAmount: 0,
      },
    ]);

    await request(app.getHttpServer())
      .post('/api/v1/invoices/import')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .attach('file', buffer1, { filename: 'first.xlsx' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/v1/invoices/import')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .attach('file', buffer2, { filename: 'second.xlsx' })
      .expect(409);

    expect(res.body.errorCode).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('14. Audit INVOICE_IMPORT metadata present when write succeeds', async () => {
    const invNum = `INV-AUDIT-${randomUUID().slice(0, 6)}`;
    const token = tokenFor(ownerA, orgA, Role.OWNER);
    const buffer = makeXlsx([
      {
        customerName: 'Audit Corp',
        customerTaxCode: '',
        customerEmail: '',
        invoiceNumber: invNum,
        issueDate: '2026-08-01',
        dueDate: '2026-09-01',
        totalAmount: 1000000,
        taxAmount: 0,
      },
    ]);

    await request(app.getHttpServer())
      .post('/api/v1/invoices/import')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .attach('file', buffer, { filename: 'test.xlsx' })
      .expect(201);

    const expectedSha256 = getImportRequestFingerprint(buffer, 'test.xlsx');

    // poll for fire-and-forget audit
    let audits: Array<Record<string, unknown>> = [];
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      audits = await dataSource.query(
        `SELECT * FROM audit_logs
         WHERE "organizationId" = $1
           AND "actionType" = 'INVOICE_IMPORT'
           AND "entityType" = 'INVOICE_IMPORT'
           AND "entityId" = $2`,
        [orgA, expectedSha256],
      );
      if (audits.length > 0) break;
    }

    expect(audits).toHaveLength(1);

    const audit = audits[0];
    expect(audit.userId).toBe(ownerA);
    expect(audit.beforeState).toBeNull();
    expect(audit.afterState).toEqual(
      expect.objectContaining({
        filename: 'test.xlsx',
        fileSha256: expectedSha256,
        totalRows: 1,
        successCount: 1,
        failedCount: 0,
      }),
    );
    expect(audit.afterState).not.toHaveProperty('rows');
    expect(audit.afterState).not.toHaveProperty('rawData');
    expect(audit.afterState).not.toHaveProperty('data');
  }, 30_000);

  it('15. Second organization cannot affect/read first org data', async () => {
    const invNum = `INV-TENANT-${randomUUID().slice(0, 6)}`;
    const tokenA = tokenFor(ownerA, orgA, Role.OWNER);
    const buffer = makeXlsx([
      {
        customerName: 'Tenant Corp',
        customerTaxCode: '',
        customerEmail: '',
        invoiceNumber: invNum,
        issueDate: '2026-08-01',
        dueDate: '2026-09-01',
        totalAmount: 1000000,
        taxAmount: 0,
      },
    ]);

    await request(app.getHttpServer())
      .post('/api/v1/invoices/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', randomUUID())
      .attach('file', buffer, { filename: 'test.xlsx' })
      .expect(201);

    const invInOrgA = await dataSource.getRepository(InvoiceOrmEntity).findOne({
      where: { organizationId: orgA, invoiceNumber: invNum },
    });
    expect(invInOrgA).toBeDefined();

    const invInOrgB = await dataSource.getRepository(InvoiceOrmEntity).findOne({
      where: { organizationId: orgB, invoiceNumber: invNum },
    });
    expect(invInOrgB).toBeNull();

    const tokenB = tokenFor(ownerB, orgB, Role.OWNER);
    const bufferB = makeXlsx([
      {
        customerName: 'Org B Corp',
        customerTaxCode: '',
        customerEmail: '',
        invoiceNumber: invNum,
        issueDate: '2026-08-01',
        dueDate: '2026-09-01',
        totalAmount: 2000000,
        taxAmount: 0,
      },
    ]);

    await request(app.getHttpServer())
      .post('/api/v1/invoices/import')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('Idempotency-Key', randomUUID())
      .attach('file', bufferB, { filename: 'test.xlsx' })
      .expect(201);

    const orgAInv = await dataSource.getRepository(InvoiceOrmEntity).findOne({
      where: { organizationId: orgA, invoiceNumber: invNum },
    });
    expect(Number(orgAInv!.totalAmount)).toBe(1000000);

    const orgBInv = await dataSource.getRepository(InvoiceOrmEntity).findOne({
      where: { organizationId: orgB, invoiceNumber: invNum },
    });
    expect(orgBInv).toBeDefined();
    expect(Number(orgBInv!.totalAmount)).toBe(2000000);
    expect(orgBInv!.id).not.toBe(orgAInv!.id);
  });
});
