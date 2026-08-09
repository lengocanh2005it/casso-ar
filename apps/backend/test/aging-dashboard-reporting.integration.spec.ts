import { randomUUID } from 'node:crypto';
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
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ErrorCode } from '../src/common/errors/error-code';
import { configureApp } from '../src/configure-app';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
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

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function monthStart(): Date {
  const month = formatInTimeZone(new Date(), REPORTING_TIMEZONE, 'yyyy-MM');
  return fromZonedTime(`${month}-01T00:00:00`, REPORTING_TIMEZONE);
}

describe('Aging dashboard reporting (integration)', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let app: INestApplication | undefined;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let today: string;
  let token: string;

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
    await dataSource.getRepository(CustomerOrmEntity).save({
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
        { bucket: 'NOT_DUE', count: 1, totalRemaining: 900 },
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
      totalOutstanding: 11_400,
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
    expect(response.body.overdueRate).toBeCloseTo(10_500 / 11_400);
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
});
