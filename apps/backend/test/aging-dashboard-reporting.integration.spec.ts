import { randomUUID } from 'node:crypto';
import { ReceivableStatus } from '@casso-ar/shared-types';
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
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ErrorCode } from '../src/common/errors/error-code';
import { configureApp } from '../src/configure-app';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { PaymentOrmEntity } from '../src/modules/payments/infrastructure/payment.orm-entity';
import { BalanceHistoryChangeSource } from '../src/modules/receivable-balance-history/domain/balance-history-change-source';
import { ReceivableBalanceHistoryOrmEntity } from '../src/modules/receivable-balance-history/infrastructure/receivable-balance-history.orm-entity';
import { ReceivableBalanceHistoryCoverageOrmEntity } from '../src/modules/receivable-balance-history/infrastructure/receivable-balance-history-coverage.orm-entity';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';
import { ReminderExecutionStatus } from '../src/modules/reminders/domain/reminder-execution';
import { ReminderExecutionOrmEntity } from '../src/modules/reminders/infrastructure/reminder-execution.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';
import { BankTransactionOrmEntity } from '../src/modules/webhooks/infrastructure/bank-transaction.orm-entity';

const REPORTING_TIMEZONE = 'Asia/Ho_Chi_Minh';
const organizationId = '00000000-0000-4000-8000-000000000151';
const userId = '00000000-0000-4000-8000-000000000152';
const customerId = '00000000-0000-4000-8000-000000000153';
const notDueReceivableId = '00000000-0000-4000-8000-000000000154';
const overdueOneToSevenId = '00000000-0000-4000-8000-000000000155';
const overdueEightToThirtyId = '00000000-0000-4000-8000-000000000156';
const overdueThirtyOneToSixtyId = '00000000-0000-4000-8000-000000000157';
const overdueSixtyPlusId = '00000000-0000-4000-8000-000000000158';
const paidReceivableId = '00000000-0000-4000-8000-000000000159';
const customer2Id = '00000000-0000-4000-8000-000000000160';
const customer2ReceivableId = '00000000-0000-4000-8000-000000000161';
const otherOrgId = '00000000-0000-4000-8000-000000000162';
const otherOrgUserId = '00000000-0000-4000-8000-000000000163';

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function monthStart(): Date {
  const month = formatInTimeZone(new Date(), REPORTING_TIMEZONE, 'yyyy-MM');
  return fromZonedTime(`${month}-01T00:00:00`, REPORTING_TIMEZONE);
}

function monthKeyOffset(offset: number): string {
  const [year, month] = formatInTimeZone(
    new Date(),
    REPORTING_TIMEZONE,
    'yyyy-MM',
  )
    .split('-')
    .map(Number);
  const index = year * 12 + (month - 1) - offset;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

function localDateTime(monthKey: string, day: number, hour = 10): Date {
  return fromZonedTime(
    `${monthKey}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00`,
    REPORTING_TIMEZONE,
  );
}

describe('Aging dashboard reporting (integration)', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let app: INestApplication | undefined;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let today: string;
  let token: string;
  let otherOrgToken: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
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

    const currentDateRow = (
      await dataSource.query('SELECT CURRENT_DATE::text AS "today"')
    )[0] as { today: string };
    today = currentDateRow.today;

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Reporting Owner',
      email: 'reporting-owner@example.com',
      passwordHash: 'test-hash',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      organizationId,
      userId,
      role: Role.OWNER,
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });
    await dataSource.getRepository(CustomerOrmEntity).save([
      {
        id: customerId,
        organizationId,
        name: 'Reporting Customer',
        taxCode: 'REPORTING-001',
        email: 'reporting-customer@example.com',
        phone: '0900000000',
        defaultPaymentTermDays: 30,
        creditLimit: 100_000_000,
        priority: 1,
        createdAt: new Date(),
      },
      {
        id: customer2Id,
        organizationId,
        name: 'Beta Trading',
        taxCode: 'BETA-002',
        email: 'beta-trading@example.com',
        phone: '0911111111',
        defaultPaymentTermDays: 30,
        creditLimit: 50_000_000,
        priority: 2,
        createdAt: new Date(),
      },
    ]);

    await dataSource.getRepository(UserOrmEntity).save({
      id: otherOrgUserId,
      name: 'Other Org Owner',
      email: 'other-org-owner@example.com',
      passwordHash: 'test-hash',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      organizationId: otherOrgId,
      userId: otherOrgUserId,
      role: Role.OWNER,
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });

    const dateAt = (offset: number) =>
      addDays(new Date(`${today}T00:00:00.000Z`), offset);
    const createdAt = new Date();
    await dataSource.getRepository(ReceivableOrmEntity).save([
      {
        id: notDueReceivableId,
        organizationId,
        customerId,
        invoiceId: null,
        originalAmount: 1_000,
        paidAmount: 100,
        dueDate: dateAt(1),
        status: ReceivableStatus.OPEN,
        salesRepresentativeId: null,
        createdAt,
        closedAt: null,
        version: 1,
      },
      {
        id: overdueOneToSevenId,
        organizationId,
        customerId,
        invoiceId: null,
        originalAmount: 2_000,
        paidAmount: 500,
        dueDate: dateAt(-1),
        status: ReceivableStatus.OPEN,
        salesRepresentativeId: null,
        createdAt,
        closedAt: null,
        version: 1,
      },
      {
        id: overdueEightToThirtyId,
        organizationId,
        customerId,
        invoiceId: null,
        originalAmount: 3_000,
        paidAmount: 1_000,
        dueDate: dateAt(-8),
        status: ReceivableStatus.PARTIALLY_PAID,
        salesRepresentativeId: null,
        createdAt,
        closedAt: null,
        version: 1,
      },
      {
        id: overdueThirtyOneToSixtyId,
        organizationId,
        customerId,
        invoiceId: null,
        originalAmount: 4_000,
        paidAmount: 1_000,
        dueDate: dateAt(-31),
        status: ReceivableStatus.OPEN,
        salesRepresentativeId: null,
        createdAt,
        closedAt: null,
        version: 1,
      },
      {
        id: overdueSixtyPlusId,
        organizationId,
        customerId,
        invoiceId: null,
        originalAmount: 5_000,
        paidAmount: 1_000,
        dueDate: dateAt(-61),
        status: ReceivableStatus.OPEN,
        salesRepresentativeId: null,
        createdAt,
        closedAt: null,
        version: 1,
      },
      {
        id: paidReceivableId,
        organizationId,
        customerId,
        invoiceId: null,
        originalAmount: 6_000,
        paidAmount: 6_000,
        dueDate: dateAt(-10),
        status: ReceivableStatus.PAID,
        salesRepresentativeId: null,
        createdAt,
        closedAt: addDays(monthStart(), 4),
        version: 1,
      },
      {
        id: customer2ReceivableId,
        organizationId,
        customerId: customer2Id,
        invoiceId: null,
        originalAmount: 8_000,
        paidAmount: 0,
        dueDate: dateAt(90),
        status: ReceivableStatus.OPEN,
        salesRepresentativeId: null,
        createdAt,
        closedAt: null,
        version: 1,
      },
    ]);

    const periodStart = monthStart();
    const paidReminderSentAt = addDays(periodStart, 1);
    const openReminderSentAt = addDays(periodStart, 2);
    await dataSource.getRepository(ReminderExecutionOrmEntity).save([
      {
        id: randomUUID(),
        organizationId,
        receivableId: paidReceivableId,
        reminderRuleId: null,
        executionDate: paidReminderSentAt,
        sentAt: paidReminderSentAt,
        status: ReminderExecutionStatus.SENT,
        skipReason: null,
        providerMessageId: 'reporting-paid',
        failureReason: null,
        createdAt: paidReminderSentAt,
      },
      {
        id: randomUUID(),
        organizationId,
        receivableId: notDueReceivableId,
        reminderRuleId: null,
        executionDate: openReminderSentAt,
        sentAt: openReminderSentAt,
        status: ReminderExecutionStatus.SENT,
        skipReason: null,
        providerMessageId: 'reporting-open',
        failureReason: null,
        createdAt: openReminderSentAt,
      },
    ]);

    await dataSource.getRepository(BankTransactionOrmEntity).save([
      {
        id: randomUUID(),
        organizationId,
        bankConnectionId: randomUUID(),
        webhookInboxId: randomUUID(),
        providerTransactionId: 'reporting-matched',
        amount: 10_000,
        transactionDateTime: paidReminderSentAt,
        counterpartyAccountNumber: '001',
        counterpartyName: 'Reporting Customer',
        transferContent: 'Matched transaction',
        status: 'MATCHED',
        version: 1,
        createdAt: paidReminderSentAt,
      },
      {
        id: randomUUID(),
        organizationId,
        bankConnectionId: randomUUID(),
        webhookInboxId: randomUUID(),
        providerTransactionId: 'reporting-unmatched',
        amount: 20_000,
        transactionDateTime: openReminderSentAt,
        counterpartyAccountNumber: '002',
        counterpartyName: 'Reporting Customer',
        transferContent: 'Pending transaction',
        status: 'PENDING_REVIEW',
        version: 1,
        createdAt: openReminderSentAt,
      },
    ]);

    token = jwtService.sign({
      userId,
      organizationId,
      role: Role.OWNER,
    });
    otherOrgToken = jwtService.sign({
      userId: otherOrgUserId,
      organizationId: otherOrgId,
      role: Role.OWNER,
    });

    const twoMonthsAgo = monthKeyOffset(2);
    const oneMonthAgo = monthKeyOffset(1);
    const currentMonth = monthKeyOffset(0);
    const trendReceivableOne = randomUUID();
    const trendReceivableTwo = randomUUID();
    await dataSource
      .getRepository(ReceivableBalanceHistoryCoverageOrmEntity)
      .save({
        organizationId,
        coveredFrom: localDateTime(twoMonthsAgo, 1),
        reason: 'HISTORY_COVERAGE_START',
      });
    await dataSource.getRepository(PaymentOrmEntity).save([
      {
        id: randomUUID(),
        organizationId,
        customerId,
        bankTransactionId: null,
        totalAmount: 12_000_000,
        allocatedAmount: 0,
        payerName: 'Trend Payer A',
        receivedAt: localDateTime(twoMonthsAgo, 3),
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        organizationId,
        customerId,
        bankTransactionId: null,
        totalAmount: 8_000_000,
        allocatedAmount: 0,
        payerName: 'Trend Payer B',
        receivedAt: localDateTime(twoMonthsAgo, 15),
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        organizationId,
        customerId,
        bankTransactionId: null,
        totalAmount: 5_000_000,
        allocatedAmount: 0,
        payerName: 'Trend Payer C',
        receivedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    await dataSource.getRepository(ReceivableBalanceHistoryOrmEntity).save([
      {
        id: randomUUID(),
        organizationId,
        receivableId: trendReceivableOne,
        status: ReceivableStatus.OPEN,
        remainingAmount: 10_000_000,
        effectiveAt: localDateTime(twoMonthsAgo, 10),
        changeSource: BalanceHistoryChangeSource.CREATE,
        changeReason: null,
        createdAt: localDateTime(twoMonthsAgo, 10),
      },
      {
        id: randomUUID(),
        organizationId,
        receivableId: trendReceivableOne,
        status: ReceivableStatus.PARTIALLY_PAID,
        remainingAmount: 4_000_000,
        effectiveAt: localDateTime(oneMonthAgo, 10),
        changeSource: BalanceHistoryChangeSource.ALLOCATE,
        changeReason: 'trend-alloc-1',
        createdAt: localDateTime(oneMonthAgo, 10),
      },
      {
        id: randomUUID(),
        organizationId,
        receivableId: trendReceivableOne,
        status: ReceivableStatus.PAID,
        remainingAmount: 0,
        effectiveAt: localDateTime(currentMonth, 2),
        changeSource: BalanceHistoryChangeSource.ALLOCATE,
        changeReason: 'trend-alloc-2',
        createdAt: localDateTime(currentMonth, 2),
      },
      {
        id: randomUUID(),
        organizationId,
        receivableId: trendReceivableTwo,
        status: ReceivableStatus.OPEN,
        remainingAmount: 7_000_000,
        effectiveAt: localDateTime(currentMonth, 3),
        changeSource: BalanceHistoryChangeSource.CREATE,
        changeReason: null,
        createdAt: localDateTime(currentMonth, 3),
      },
    ]);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('rejects unauthenticated aging report requests', async () => {
    await request(app?.getHttpServer())
      .get('/api/v1/reports/aging')
      .expect(401);
  });

  it('rejects unauthenticated dashboard summary requests', async () => {
    await request(app?.getHttpServer())
      .get('/api/v1/reports/dashboard-summary')
      .expect(401);
  });

  it('assigns receivables to all five aging buckets', async () => {
    const response = await request(app?.getHttpServer())
      .get('/api/v1/reports/aging')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      buckets: [
        { bucket: 'NOT_DUE', count: 2, totalRemaining: 8_900 },
        { bucket: 'OVERDUE_1_7', count: 1, totalRemaining: 1_500 },
        { bucket: 'OVERDUE_8_30', count: 1, totalRemaining: 2_000 },
        { bucket: 'OVERDUE_31_60', count: 1, totalRemaining: 3_000 },
        { bucket: 'OVERDUE_60_PLUS', count: 1, totalRemaining: 4_000 },
      ],
    });
  });

  it('returns the dashboard rollup and period-scoped metrics', async () => {
    const response = await request(app?.getHttpServer())
      .get('/api/v1/reports/dashboard-summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      totalOutstanding: 19_400,
      totalOverdue: 10_500,
      cashForecast: { forecast7d: 900, forecast14d: 900, forecast30d: 900 },
      topOverdueCustomers: [
        {
          customerId,
          customerName: 'Reporting Customer',
          totalOverdue: 10_500,
        },
      ],
      autoMatchRate: 0.5,
      manualHandlingRate: 0.5,
      reminderEffectiveness: 0.5,
    });
    expect(response.body.overdueRate).toBeCloseTo(10_500 / 19_400);
  });

  it('rejects a reversed dashboard date range with VALIDATION_ERROR', async () => {
    const response = await request(app?.getHttpServer())
      .get('/api/v1/reports/dashboard-summary')
      .set('Authorization', `Bearer ${token}`)
      .query({ from: '2026-08-09', to: '2026-08-01' })
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      errorCode: ErrorCode.VALIDATION_ERROR,
    });
  });

  it('rejects a dashboard date range longer than 90 days', async () => {
    const response = await request(app?.getHttpServer())
      .get('/api/v1/reports/dashboard-summary')
      .set('Authorization', `Bearer ${token}`)
      .query({ from: '2026-01-01', to: '2026-04-02' })
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      errorCode: ErrorCode.VALIDATION_ERROR,
    });
  });

  it('rejects a dashboard date range with only "from" supplied', async () => {
    const response = await request(app?.getHttpServer())
      .get('/api/v1/reports/dashboard-summary')
      .set('Authorization', `Bearer ${token}`)
      .query({ from: '2026-08-01' })
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      errorCode: ErrorCode.VALIDATION_ERROR,
    });
  });

  it('rejects unauthenticated customer aging requests', async () => {
    await request(app?.getHttpServer())
      .get('/api/v1/reports/aging/customers')
      .expect(401);
  });

  it('returns customer aging rows ordered by total remaining then name', async () => {
    const response = await request(app?.getHttpServer())
      .get('/api/v1/reports/aging/customers')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      items: [
        {
          customerId,
          customerName: 'Reporting Customer',
          taxCode: 'REPORTING-001',
          buckets: [
            { bucket: 'NOT_DUE', totalRemaining: 900 },
            { bucket: 'OVERDUE_1_7', totalRemaining: 1_500 },
            { bucket: 'OVERDUE_8_30', totalRemaining: 2_000 },
            { bucket: 'OVERDUE_31_60', totalRemaining: 3_000 },
            { bucket: 'OVERDUE_60_PLUS', totalRemaining: 4_000 },
          ],
          totalRemaining: 11_400,
        },
        {
          customerId: customer2Id,
          customerName: 'Beta Trading',
          taxCode: 'BETA-002',
          buckets: [
            { bucket: 'NOT_DUE', totalRemaining: 8_000 },
            { bucket: 'OVERDUE_1_7', totalRemaining: 0 },
            { bucket: 'OVERDUE_8_30', totalRemaining: 0 },
            { bucket: 'OVERDUE_31_60', totalRemaining: 0 },
            { bucket: 'OVERDUE_60_PLUS', totalRemaining: 0 },
          ],
          totalRemaining: 8_000,
        },
      ],
      total: 2,
      page: 1,
      limit: 20,
    });
  });

  it('searches customer aging by name, tax code, and phone', async () => {
    const byName = await request(app?.getHttpServer())
      .get('/api/v1/reports/aging/customers')
      .set('Authorization', `Bearer ${token}`)
      .query({ search: 'beta' })
      .expect(200);
    expect(byName.body.total).toBe(1);
    expect(byName.body.items[0]).toMatchObject({
      customerName: 'Beta Trading',
    });

    const byTaxCode = await request(app?.getHttpServer())
      .get('/api/v1/reports/aging/customers')
      .set('Authorization', `Bearer ${token}`)
      .query({ search: 'REPORTING-001' })
      .expect(200);
    expect(byTaxCode.body.total).toBe(1);
    expect(byTaxCode.body.items[0]).toMatchObject({
      customerName: 'Reporting Customer',
    });

    const byPhone = await request(app?.getHttpServer())
      .get('/api/v1/reports/aging/customers')
      .set('Authorization', `Bearer ${token}`)
      .query({ search: '0911111111' })
      .expect(200);
    expect(byPhone.body.total).toBe(1);
    expect(byPhone.body.items[0]).toMatchObject({
      customerName: 'Beta Trading',
    });
  });

  it('filters customer aging to buckets with a positive amount', async () => {
    const overdue = await request(app?.getHttpServer())
      .get('/api/v1/reports/aging/customers')
      .set('Authorization', `Bearer ${token}`)
      .query({ bucket: 'OVERDUE_1_7' })
      .expect(200);
    expect(overdue.body.total).toBe(1);
    expect(overdue.body.items[0]).toMatchObject({
      customerName: 'Reporting Customer',
    });

    const notDue = await request(app?.getHttpServer())
      .get('/api/v1/reports/aging/customers')
      .set('Authorization', `Bearer ${token}`)
      .query({ bucket: 'NOT_DUE' })
      .expect(200);
    expect(notDue.body.total).toBe(2);
  });

  it('paginates customer aging with stable total-remaining ordering', async () => {
    const firstPage = await request(app?.getHttpServer())
      .get('/api/v1/reports/aging/customers')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, limit: 1 })
      .expect(200);
    expect(firstPage.body.total).toBe(2);
    expect(firstPage.body.items).toHaveLength(1);
    expect(firstPage.body.items[0]).toMatchObject({
      customerName: 'Reporting Customer',
    });

    const secondPage = await request(app?.getHttpServer())
      .get('/api/v1/reports/aging/customers')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 2, limit: 1 })
      .expect(200);
    expect(secondPage.body.total).toBe(2);
    expect(secondPage.body.items).toHaveLength(1);
    expect(secondPage.body.items[0]).toMatchObject({
      customerName: 'Beta Trading',
    });
  });

  it('keeps the matching total when the requested page is empty', async () => {
    const response = await request(app?.getHttpServer())
      .get('/api/v1/reports/aging/customers')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 3, limit: 1 })
      .expect(200);

    expect(response.body).toEqual({
      items: [],
      total: 2,
      page: 3,
      limit: 1,
    });
  });

  it('isolates customer aging rows by organization', async () => {
    const response = await request(app?.getHttpServer())
      .get('/api/v1/reports/aging/customers')
      .set('Authorization', `Bearer ${otherOrgToken}`)
      .expect(200);

    expect(response.body).toEqual({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
  });

  it('rejects unauthenticated trend requests', async () => {
    await request(app?.getHttpServer())
      .get('/api/v1/reports/trend')
      .expect(401);
  });

  it('returns the collected and outstanding trend for 3 months', async () => {
    const response = await request(app?.getHttpServer())
      .get('/api/v1/reports/trend')
      .set('Authorization', `Bearer ${token}`)
      .query({ months: 3 })
      .expect(200);

    const twoMonthsAgo = monthKeyOffset(2);
    const oneMonthAgo = monthKeyOffset(1);
    const currentMonth = monthKeyOffset(0);
    expect(response.body.months).toBe(3);
    expect(response.body.items).toEqual([
      {
        month: twoMonthsAgo,
        outstanding: 10_000_000,
        collected: 20_000_000,
      },
      {
        month: oneMonthAgo,
        outstanding: 4_000_000,
        collected: 0,
      },
      {
        month: currentMonth,
        outstanding: 7_000_000,
        collected: 5_000_000,
      },
    ]);
  });

  it('returns exactly 6 points with null outstanding before history coverage', async () => {
    const response = await request(app?.getHttpServer())
      .get('/api/v1/reports/trend')
      .set('Authorization', `Bearer ${token}`)
      .query({ months: 6 })
      .expect(200);

    expect(response.body.months).toBe(6);
    expect(response.body.items).toHaveLength(6);
    const preHistory = response.body.items.slice(0, 3);
    expect(preHistory).toEqual([
      { month: monthKeyOffset(5), outstanding: null, collected: 0 },
      { month: monthKeyOffset(4), outstanding: null, collected: 0 },
      { month: monthKeyOffset(3), outstanding: null, collected: 0 },
    ]);
    expect(response.body.items[3]).toMatchObject({
      month: monthKeyOffset(2),
      outstanding: 10_000_000,
      collected: 20_000_000,
    });
  });

  it('returns exactly 12 points, oldest to newest', async () => {
    const response = await request(app?.getHttpServer())
      .get('/api/v1/reports/trend')
      .set('Authorization', `Bearer ${token}`)
      .query({ months: 12 })
      .expect(200);

    expect(response.body.months).toBe(12);
    expect(response.body.items).toHaveLength(12);
    const keys = response.body.items.map(
      (point: { month: string }) => point.month,
    );
    expect([...keys].sort()).toEqual(keys);
    expect(response.body.items[0]).toEqual({
      month: monthKeyOffset(11),
      outstanding: null,
      collected: 0,
    });
    expect(response.body.items[11]).toMatchObject({
      month: monthKeyOffset(0),
      outstanding: 7_000_000,
      collected: 5_000_000,
    });
  });

  it('rejects an invalid months value with VALIDATION_ERROR', async () => {
    const response = await request(app?.getHttpServer())
      .get('/api/v1/reports/trend')
      .set('Authorization', `Bearer ${token}`)
      .query({ months: 5 })
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      errorCode: ErrorCode.VALIDATION_ERROR,
    });
  });

  it('isolates trend data by organization', async () => {
    const response = await request(app?.getHttpServer())
      .get('/api/v1/reports/trend')
      .set('Authorization', `Bearer ${otherOrgToken}`)
      .query({ months: 3 })
      .expect(200);

    expect(response.body.items).toEqual([
      { month: monthKeyOffset(2), outstanding: null, collected: 0 },
      { month: monthKeyOffset(1), outstanding: null, collected: 0 },
      { month: monthKeyOffset(0), outstanding: null, collected: 0 },
    ]);
  });
});
