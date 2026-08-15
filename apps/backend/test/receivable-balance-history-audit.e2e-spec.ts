import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import request from 'supertest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { AddReceivableBalanceHistoryAuditMetadata20260823000000 } from '../src/database/migrations/20260823000000-add-receivable-balance-history-audit-metadata';
import { CustomerBankAccountOrmEntity } from '../src/modules/bank-accounts/infrastructure/customer-bank-account.orm-entity';
import { BankConnectionOrmEntity } from '../src/modules/bank-connections/infrastructure/bank-connection.orm-entity';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { InvoiceStatus } from '../src/modules/invoices/domain/invoice';
import { InvoiceOrmEntity } from '../src/modules/invoices/infrastructure/invoice.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

const REPORTING_TIMEZONE = 'Asia/Ho_Chi_Minh';

const orgA = '00000000-0000-4000-8000-0000000000a1';
const orgB = '00000000-0000-4000-8000-0000000000b1';
const orgC = '00000000-0000-4000-8000-0000000000c1';
const orgE = '00000000-0000-4000-8000-0000000000e1';

const ownerA = '00000000-0000-4000-8000-0000000000a2';
const fmA = '00000000-0000-4000-8000-0000000000a3';
const accountantA = '00000000-0000-4000-8000-0000000000a4';
const salesA = '00000000-0000-4000-8000-0000000000a5';
const viewerA = '00000000-0000-4000-8000-0000000000a6';
const ownerB = '00000000-0000-4000-8000-0000000000b2';
const ownerC = '00000000-0000-4000-8000-0000000000c2';
const ownerE = '00000000-0000-4000-8000-0000000000e2';

const customerA = '00000000-0000-4000-8000-0000000000a7';
const customerB = '00000000-0000-4000-8000-0000000000b3';
const customerC = '00000000-0000-4000-8000-0000000000c3';
const customerE = '00000000-0000-4000-8000-0000000000e3';

const bankConnectionId = '00000000-0000-4000-8000-0000000000a8';
const receivableB = '00000000-0000-4000-8000-0000000000ba';
const receivableE = '00000000-0000-4000-8000-0000000000ea';
const invoiceA = '00000000-0000-4000-8000-0000000000aa';

const webhookPayload = {
  organizationId: orgA,
  bankConnectionId,
  transactionId: `audit-tx-${randomUUID()}`,
  amount: 30_000_000,
  transactionDateTime: '2026-08-14T10:00:00.000Z',
  counterpartyAccountNumber: '0011002233',
  counterpartyName: 'Công ty A',
  transferContent: 'Thanh toan INV-AUDIT-001',
};

describe('Receivable balance history audit (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let redis: StartedTestContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  function tokenFor(
    userId: string,
    organizationId: string,
    role: Role,
  ): string {
    return jwtService.sign({ userId, organizationId, role });
  }

  async function seedUser(
    id: string,
    name: string,
    organizationId: string,
    role: Role,
  ): Promise<void> {
    await dataSource.getRepository(UserOrmEntity).save({
      id,
      name,
      email: `${id}@example.com`,
      passwordHash: 'test-hash',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      organizationId,
      userId: id,
      role,
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });
  }

  async function seedCustomer(
    id: string,
    organizationId: string,
    name: string,
  ): Promise<void> {
    await dataSource.getRepository(CustomerOrmEntity).save({
      id,
      organizationId,
      name,
      taxCode: `TAX-${id}`,
      email: `${id}@customer.example.com`,
      phone: '0900000000',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      createdAt: new Date(),
    });
  }

  function localDate(offsetDays: number): string {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return formatInTimeZone(date, REPORTING_TIMEZONE, 'yyyy-MM-dd');
  }

  function localDayStart(offsetDays: number): Date {
    return fromZonedTime(
      `${localDate(offsetDays)}T00:00:00`,
      REPORTING_TIMEZONE,
    );
  }

  beforeAll(async () => {
    [container, redis] = await Promise.all([
      new PostgreSqlContainer('postgres:16').start(),
      new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
    ]);
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.REDIS_HOST = redis.getHost();
    process.env.REDIS_PORT = String(redis.getMappedPort(6379));
    process.env.JWT_SECRET = 'e2e-jwt-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'e2e-resend-key';
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
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);

    await seedUser(ownerA, 'Owner A', orgA, Role.OWNER);
    await seedUser(fmA, 'FM A', orgA, Role.FINANCE_MANAGER);
    await seedUser(accountantA, 'Accountant A', orgA, Role.ACCOUNTANT);
    await seedUser(salesA, 'Sales A', orgA, Role.SALES_REP);
    await seedUser(viewerA, 'Viewer A', orgA, Role.VIEWER);
    await seedUser(ownerB, 'Owner B', orgB, Role.OWNER);
    await seedUser(ownerC, 'Owner C', orgC, Role.OWNER);
    await seedUser(ownerE, 'Owner E', orgE, Role.OWNER);

    await seedCustomer(customerA, orgA, 'Công ty A');
    await seedCustomer(customerB, orgB, 'Công ty B');
    await seedCustomer(customerC, orgC, 'Công ty C');
    await seedCustomer(customerE, orgE, 'Công ty E');

    await dataSource.getRepository(InvoiceOrmEntity).save({
      id: invoiceA,
      organizationId: orgA,
      customerId: customerA,
      invoiceNumber: 'INV-AUDIT-001',
      issueDate: new Date('2026-07-01T00:00:00.000Z'),
      totalAmount: 30_000_000,
      taxAmount: 0,
      sourceType: 'MANUAL',
      fileUrl: null,
      status: InvoiceStatus.ISSUED,
      createdAt: new Date(),
    });

    await dataSource.getRepository(BankConnectionOrmEntity).save({
      id: bankConnectionId,
      organizationId: orgA,
      casIdConnectionSessionId: '00000000-0000-0000-0000-0000000000f3',
      encryptedAccessToken: 'encrypted-test-token',
      accountIdentity: { accountNumber: '99887766', bankName: 'Test Bank' },
      status: 'ACTIVE',
      scopes: ['balances'],
      connectedAt: new Date(),
      lastSyncAt: new Date(),
      revokedAt: null,
      createdAt: new Date(),
    });
    await dataSource.getRepository(CustomerBankAccountOrmEntity).save({
      id: '00000000-0000-4000-8000-0000000000ab',
      organizationId: orgA,
      customerId: customerA,
      accountNumber: '0011002233',
      createdAt: new Date(),
    });
    await dataSource.getRepository(ReceivableOrmEntity).save({
      id: receivableB,
      organizationId: orgC,
      customerId: customerC,
      invoiceId: null,
      originalAmount: 100_000_000,
      paidAmount: 0,
      dueDate: new Date('2026-09-01T00:00:00.000Z'),
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: null,
      createdAt: new Date(),
      closedAt: null,
      version: 1,
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await Promise.all([redis.stop(), container.stop()]);
  }, 60_000);

  let receivableAId = '';

  async function createReceivableA(): Promise<void> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/receivables')
      .set('Authorization', `Bearer ${tokenFor(ownerA, orgA, Role.OWNER)}`)
      .set('Idempotency-Key', `audit-create-${randomUUID()}`)
      .send({
        customerId: customerA,
        invoiceId: invoiceA,
        originalAmount: 30_000_000,
        dueDate: '2026-09-01T00:00:00.000Z',
        salesRepresentativeId: ownerA,
      })
      .expect(201);
    receivableAId = response.body.id as string;
    expect(receivableAId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  }

  async function allocateViaWebhook(): Promise<void> {
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/casso-balance-hook')
      .set({ 'x-client-id': 'e2e-client', 'x-secret-key': 'e2e-secret' })
      .send(webhookPayload)
      .expect(200, { received: true, duplicate: false });

    const receivableRepo = dataSource.getRepository(ReceivableOrmEntity);
    const deadline = Date.now() + 20_000;
    let receivable: ReceivableOrmEntity | null = null;
    while (Date.now() < deadline) {
      receivable = await receivableRepo.findOneBy({ id: receivableAId });
      if (receivable && Number(receivable.paidAmount) === 30_000_000) break;
      await delay(100);
    }
    expect(Number(receivable?.paidAmount ?? 0)).toBe(30_000_000);
  }

  async function allocationIdFor(receivableId: string): Promise<string> {
    const rows = (await dataSource.query(
      `SELECT id FROM payment_allocations
       WHERE "organizationId" = $1 AND "receivableId" = $2
       ORDER BY "createdAt" DESC LIMIT 1`,
      [orgA, receivableId],
    )) as Array<{ id: string }>;
    return rows[0]?.id ?? '';
  }

  async function insertLegacyRow(options: {
    organizationId: string;
    receivableId: string;
    status: string;
    remainingAmount: number;
    effectiveAt: Date;
    changeSource: string;
    note?: string | null;
  }): Promise<void> {
    await dataSource.query(
      `INSERT INTO receivable_balance_history
        ("id", "organizationId", "receivableId", "status", "remainingAmount",
         "effectiveAt", "changeSource", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $6)`,
      [
        randomUUID(),
        options.organizationId,
        options.receivableId,
        options.status,
        options.remainingAmount,
        options.effectiveAt,
        options.changeSource,
      ],
    );
  }

  it('lets owner and finance manager read only their own organization rows', async () => {
    await createReceivableA();
    await insertLegacyRow({
      organizationId: orgA,
      receivableId: receivableAId,
      status: ReceivableStatus.OPEN,
      remainingAmount: 25_000_000,
      effectiveAt: localDayStart(-2),
      changeSource: 'CREATE',
    });

    await request(app.getHttpServer())
      .post('/api/v1/receivables')
      .set('Authorization', `Bearer ${tokenFor(ownerB, orgB, Role.OWNER)}`)
      .set('Idempotency-Key', `audit-create-b-${randomUUID()}`)
      .send({
        customerId: customerB,
        invoiceId: null,
        originalAmount: 9_000_000,
        dueDate: '2026-09-01T00:00:00.000Z',
        salesRepresentativeId: ownerB,
      })
      .expect(201);

    const ownerList = await request(app.getHttpServer())
      .get('/api/v1/receivable-balance-history?page=1&limit=50')
      .set('Authorization', `Bearer ${tokenFor(ownerA, orgA, Role.OWNER)}`)
      .expect(200);
    expect(ownerList.body.total).toBe(2);
    expect(
      ownerList.body.items.every(
        (i: { customerId: string }) => i.customerId === customerA,
      ),
    ).toBe(true);
    expect(ownerList.body.items[0]).not.toHaveProperty('organizationId');
    expect(ownerList.body.items[0]).not.toHaveProperty('actorUserId');
    expect(ownerList.body.items[0]).not.toHaveProperty('email');
    expect(ownerList.body.items[0].invoiceNumber).toBe('INV-AUDIT-001');
    expect(ownerList.body.items[0].actorDisplayName).toBe('Owner A');

    const fmList = await request(app.getHttpServer())
      .get('/api/v1/receivable-balance-history?page=1&limit=50')
      .set(
        'Authorization',
        `Bearer ${tokenFor(fmA, orgA, Role.FINANCE_MANAGER)}`,
      )
      .expect(200);
    expect(fmList.body.total).toBe(2);

    const ownerBList = await request(app.getHttpServer())
      .get('/api/v1/receivable-balance-history?page=1&limit=50')
      .set('Authorization', `Bearer ${tokenFor(ownerB, orgB, Role.OWNER)}`)
      .expect(200);
    expect(ownerBList.body.total).toBe(1);
    expect(ownerBList.body.items[0].customerId).toBe(customerB);

    // Tenant B cannot reach tenant A rows through the receivable filter.
    const crossTenant = await request(app.getHttpServer())
      .get(`/api/v1/receivable-balance-history?receivableId=${receivableAId}`)
      .set('Authorization', `Bearer ${tokenFor(ownerB, orgB, Role.OWNER)}`)
      .expect(200);
    expect(crossTenant.body.total).toBe(0);
    expect(crossTenant.body.items).toEqual([]);
  });

  it('rejects accountant, sales rep, viewer, and unauthenticated requests', async () => {
    const endpoints = [
      '/api/v1/receivable-balance-history?page=1&limit=20',
      '/api/v1/receivable-balance-history/summary',
      '/api/v1/receivable-balance-history/export',
    ];
    for (const endpoint of endpoints) {
      await request(app.getHttpServer())
        .get(endpoint)
        .set(
          'Authorization',
          `Bearer ${tokenFor(accountantA, orgA, Role.ACCOUNTANT)}`,
        )
        .expect(403);
      await request(app.getHttpServer())
        .get(endpoint)
        .set(
          'Authorization',
          `Bearer ${tokenFor(salesA, orgA, Role.SALES_REP)}`,
        )
        .expect(403);
      await request(app.getHttpServer())
        .get(endpoint)
        .set('Authorization', `Bearer ${tokenFor(viewerA, orgA, Role.VIEWER)}`)
        .expect(403);
      await request(app.getHttpServer()).get(endpoint).expect(401);
    }
  });

  it('rejects invalid filter values with the standard validation shape', async () => {
    const token = tokenFor(ownerA, orgA, Role.OWNER);
    const cases = [
      'receivableId=not-a-uuid',
      'from=2026-13-45',
      'to=not-a-date',
      'status=NOPE',
      'changeSource=BOGUS',
      'actorType=ROBOT',
    ];
    for (const query of cases) {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/receivable-balance-history?${query}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
      expect(response.body.errorCode).toBe('VALIDATION_ERROR');
    }
  });

  it('orders newest first, keeps legacy metadata null, and shows webhook vs user undo provenance', async () => {
    await allocateViaWebhook();

    const list = await request(app.getHttpServer())
      .get('/api/v1/receivable-balance-history?page=1&limit=50')
      .set('Authorization', `Bearer ${tokenFor(ownerA, orgA, Role.OWNER)}`)
      .expect(200);
    const items = list.body.items as Array<{
      id: string;
      sequence: number;
      effectiveAt: string;
      status: string;
      remainingAmount: number;
      changeSource: string;
      reasonCode: string | null;
      actorType: string | null;
      actorDisplayName: string | null;
      transitionReferenceId: string | null;
      note: string | null;
      invoiceNumber: string | null;
    }>;
    expect(items).toHaveLength(3);

    // effectiveAt DESC, sequence DESC: webhook ALLOCATE is the newest row.
    const webhookRow = items[0];
    expect(webhookRow).toMatchObject({
      changeSource: 'ALLOCATE',
      reasonCode: 'PAYMENT_ALLOCATED',
      actorType: 'WEBHOOK',
      actorDisplayName: null,
      status: ReceivableStatus.PAID,
      remainingAmount: 0,
      invoiceNumber: 'INV-AUDIT-001',
    });
    expect(webhookRow.transitionReferenceId).toBeTruthy();
    const allocationId = webhookRow.transitionReferenceId as string;

    // Legacy rows carry null actor/reason metadata.
    const legacyRow = items[2];
    expect(legacyRow).toMatchObject({
      changeSource: 'CREATE',
      reasonCode: null,
      actorType: null,
      note: null,
      transitionReferenceId: null,
    });
    expect(legacyRow.remainingAmount).toBe(25_000_000);

    // The undo keeps the same allocation reference but a distinct actor.
    await request(app.getHttpServer())
      .post(`/api/v1/payments/allocations/${allocationId}/undo`)
      .set(
        'Authorization',
        `Bearer ${tokenFor(fmA, orgA, Role.FINANCE_MANAGER)}`,
      )
      .set('Idempotency-Key', `audit-undo-${randomUUID()}`)
      .send({ undoReason: 'Nhập sai số tiền' })
      .expect(201);

    const afterUndo = await request(app.getHttpServer())
      .get('/api/v1/receivable-balance-history?page=1&limit=50')
      .set('Authorization', `Bearer ${tokenFor(ownerA, orgA, Role.OWNER)}`)
      .expect(200);
    const afterItems = afterUndo.body.items as typeof items;
    expect(afterItems).toHaveLength(4);

    const undoRow = afterItems[0];
    expect(undoRow).toMatchObject({
      changeSource: 'UNDO',
      reasonCode: 'PAYMENT_ALLOCATION_UNDONE',
      actorType: 'USER',
      status: ReceivableStatus.OPEN,
      remainingAmount: 30_000_000,
      transitionReferenceId: allocationId,
      note: 'Nhập sai số tiền',
    });
    expect(undoRow.actorDisplayName).toBe('FM A');

    // Prior snapshots are immutable: the webhook row is unchanged.
    const unchangedWebhookRow = afterItems[1];
    expect(unchangedWebhookRow).toMatchObject({
      changeSource: 'ALLOCATE',
      remainingAmount: 0,
      transitionReferenceId: allocationId,
      effectiveAt: webhookRow.effectiveAt,
      sequence: webhookRow.sequence,
    });
  }, 30_000);

  it('summarizes KPIs with latest-snapshot-only remaining and HCMC day buckets', async () => {
    const from = localDate(-2);
    const to = localDate(0);
    const response = await request(app.getHttpServer())
      .get(`/api/v1/receivable-balance-history/summary?from=${from}&to=${to}`)
      .set('Authorization', `Bearer ${tokenFor(ownerA, orgA, Role.OWNER)}`)
      .expect(200);

    expect(response.body).toMatchObject({
      totalTransitions: 4,
      affectedReceivables: 1,
      latestRemainingAmount: 30_000_000,
    });
    // One receivable's latest snapshot is OPEN at 30M; legacy 25M and the
    // PAID-in-between snapshots are not summed.

    const series = response.body.dailySeries as Array<{
      date: string;
      transitions: number;
    }>;
    expect(series).toHaveLength(3);
    expect(series[0]).toEqual({ date: from, transitions: 1 });
    expect(series[1].transitions).toBe(0);
    expect(series[2]).toEqual({ date: to, transitions: 3 });

    const sources = response.body.sourceDistribution as Array<{
      changeSource: string;
      count: number;
    }>;
    expect(sources).toEqual(
      expect.arrayContaining([
        { changeSource: 'CREATE', count: 2 },
        { changeSource: 'ALLOCATE', count: 1 },
        { changeSource: 'UNDO', count: 1 },
      ]),
    );
  });

  it('exports filtered CSV with formula-safe escaping, truncation header, and one audit log', async () => {
    await insertLegacyRow({
      organizationId: orgC,
      receivableId: receivableB,
      status: ReceivableStatus.OPEN,
      remainingAmount: 1,
      effectiveAt: new Date('2026-08-10T02:00:00.000Z'),
      changeSource: 'CANCEL',
    });
    await dataSource.query(
      `INSERT INTO receivable_balance_history
        ("id", "organizationId", "receivableId", "status", "remainingAmount",
         "effectiveAt", "changeSource", "createdAt")
       SELECT gen_random_uuid(), $1, $2, 'OPEN', g,
              now() - make_interval(mins => g), 'CREATE', now() - make_interval(mins => g)
       FROM generate_series(1, 10001) AS g`,
      [orgC, receivableB],
    );

    const ownerCToken = tokenFor(ownerC, orgC, Role.OWNER);
    const filteredExport = await request(app.getHttpServer())
      .get('/api/v1/receivable-balance-history/export?changeSource=CANCEL')
      .set('Authorization', `Bearer ${ownerCToken}`)
      .expect(200)
      .expect('Content-Type', /text\/csv/);
    expect(filteredExport.headers['x-export-truncated']).toBeUndefined();
    const csv = filteredExport.text;
    expect(csv).toContain(
      'Thời điểm hiệu lực,Mã hóa đơn,Khách hàng,Trạng thái,Số tiền còn lại',
    );
    expect(csv).not.toContain('organizationId');
    expect(csv).not.toContain('@example.com');

    // The formula-looking note must be escaped and the newest rows returned.
    await dataSource.query(
      `INSERT INTO receivable_balance_history
        ("id", "organizationId", "receivableId", "status", "remainingAmount",
         "effectiveAt", "changeSource", "note", "createdAt")
       VALUES (gen_random_uuid(), $1, $2, 'OPEN', 2, now(), 'WRITE_OFF', $3, now())`,
      [orgC, receivableB, '=HYPERLINK("https://evil.example", "x")'],
    );

    const unfiltered = await request(app.getHttpServer())
      .get('/api/v1/receivable-balance-history/export')
      .set('Authorization', `Bearer ${ownerCToken}`)
      .expect(200);
    expect(unfiltered.headers['x-export-truncated']).toBe('true');
    expect(unfiltered.text.split('\r\n').length - 1).toBe(10_000);
    expect(unfiltered.text).toContain(`'=HYPERLINK(`);

    const auditRows = (await dataSource.query(
      `SELECT "actionType", "organizationId", "afterState"
       FROM audit_logs
       WHERE "actionType" = 'RECEIVABLE_BALANCE_HISTORY_EXPORT'
         AND "organizationId" = $1
       ORDER BY "createdAt"`,
      [orgC],
    )) as Array<{
      actionType: string;
      organizationId: string;
      afterState: unknown;
    }>;
    expect(auditRows).toHaveLength(2);
    expect(auditRows[0].afterState).toMatchObject({
      filters: { changeSource: 'CANCEL' },
      truncated: false,
    });
    expect(auditRows[1].afterState).toMatchObject({
      filters: { changeSource: null },
      truncated: true,
    });
  });

  it('rate limits the export to ten requests per minute per organization user', async () => {
    const token = tokenFor(ownerE, orgE, Role.OWNER);
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer())
        .get('/api/v1/receivable-balance-history/export')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    }
    const blocked = await request(app.getHttpServer())
      .get('/api/v1/receivable-balance-history/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(429);
    expect(blocked.body.errorCode).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('runs the audit metadata migration up/down with legacy reference backfill', async () => {
    const migration =
      new AddReceivableBalanceHistoryAuditMetadata20260823000000();
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.startTransaction();
      const orgD = '00000000-0000-4000-8000-0000000000d1';
      const allocationSameOrg = randomUUID();
      const allocationOtherOrg = randomUUID();
      await queryRunner.query(
        `INSERT INTO payment_allocations
          ("id", "organizationId", "paymentId", "receivableId", "allocatedAmount",
           "allocatedAt", "allocatedByUserId", "deletedAt", "deletedByUserId",
           "undoReason", "createdAt")
         VALUES ($1, $2, $3, $4, 1000, now(), NULL, NULL, NULL, NULL, now())`,
        [allocationSameOrg, orgD, randomUUID(), randomUUID()],
      );
      await queryRunner.query(
        `INSERT INTO payment_allocations
          ("id", "organizationId", "paymentId", "receivableId", "allocatedAmount",
           "allocatedAt", "allocatedByUserId", "deletedAt", "deletedByUserId",
           "undoReason", "createdAt")
         VALUES ($1, $2, $3, $4, 1000, now(), NULL, NULL, NULL, NULL, now())`,
        [allocationOtherOrg, orgB, randomUUID(), randomUUID()],
      );
      for (const [changeReason, expected] of [
        [allocationSameOrg, allocationSameOrg],
        [allocationOtherOrg, null],
        ['not-a-uuid', null],
        [null, null],
      ] as const) {
        await queryRunner.query(
          `INSERT INTO receivable_balance_history
            ("id", "organizationId", "receivableId", "status", "remainingAmount",
             "effectiveAt", "changeSource", "changeReason", "createdAt")
           VALUES (gen_random_uuid(), $1, gen_random_uuid(), 'OPEN', 100,
                   now(), 'ALLOCATE', $2, now())`,
          [orgD, changeReason],
        );
      }

      await migration.up(queryRunner);

      const backfilled = (await queryRunner.query(
        `SELECT "changeReason", "transitionReferenceId"
         FROM receivable_balance_history
         WHERE "organizationId" = $1
         ORDER BY "changeReason" NULLS LAST`,
        [orgD],
      )) as Array<{
        changeReason: string | null;
        transitionReferenceId: string | null;
      }>;
      const byReason = new Map(
        backfilled.map((row) => [row.changeReason, row.transitionReferenceId]),
      );
      expect(byReason.get(allocationSameOrg)).toBe(allocationSameOrg);
      expect(byReason.get(allocationOtherOrg)).toBeNull();
      expect(byReason.get('not-a-uuid')).toBeNull();
      expect(byReason.get(null)).toBeNull();

      await migration.down(queryRunner);

      const columns = (await queryRunner.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'receivable_balance_history'
           AND column_name IN ('actorType', 'actorUserId', 'reasonCode', 'note', 'transitionReferenceId')`,
      )) as Array<{ column_name: string }>;
      expect(columns).toEqual([]);

      await queryRunner.rollbackTransaction();
    } finally {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      await queryRunner.release();
    }
  });
});
