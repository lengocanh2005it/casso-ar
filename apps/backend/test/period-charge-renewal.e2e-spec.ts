import { createHmac } from 'node:crypto';
import {
  PeriodChargeStatus,
  PlanId,
  SubscriptionStatus,
} from '@casso-ar/shared-types';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import request from 'supertest';
import type { StartedTestContainer } from 'testcontainers';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { SubscriptionOrmEntity } from '../src/modules/billing/infrastructure/subscription.orm-entity';
import type { IEmailQueue } from '../src/modules/notifications/application/email-queue.port';
import { EMAIL_QUEUE_PORT } from '../src/modules/notifications/application/email-queue.port';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { NonRenewalDowngradeScannerService } from '../src/modules/payos/application/non-renewal-downgrade-scanner.service';
import type { IPayosPaymentAdapter } from '../src/modules/payos/application/payos-payment-adapter.port';
import { PAYOS_PAYMENT_ADAPTER } from '../src/modules/payos/application/payos-payment-adapter.port';
import { RenewalReminderScannerService } from '../src/modules/payos/application/renewal-reminder-scanner.service';
import { PeriodChargeOrmEntity } from '../src/modules/payos/infrastructure/period-charge.orm-entity';
import { PlanPaymentHistoryOrmEntity } from '../src/modules/payos/infrastructure/plan-payment-history.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';
import { startTestRedis } from './helpers/test-redis';

const CHECKSUM_KEY = 'e2e-payos-checksum-key';
const paymentLinks = new Map<string, { orderCode: number; amount: number }>();

function signWebhookData(data: Record<string, unknown>): string {
  const query = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k] ?? ''}`)
    .join('&');
  return createHmac('sha256', CHECKSUM_KEY).update(query).digest('hex');
}

const fakeAdapter: IPayosPaymentAdapter = {
  createPaymentLink: async (input) => {
    const paymentLinkId = `test-link-${input.orderCode}`;
    paymentLinks.set(paymentLinkId, {
      orderCode: input.orderCode,
      amount: input.amount,
    });
    return {
      checkoutUrl: `https://pay.payos.vn/${input.orderCode}`,
      orderCode: input.orderCode,
      paymentLinkId,
    };
  },
  getPaymentLink: async (paymentLinkId) => {
    const link = paymentLinks.get(paymentLinkId);
    if (!link) throw new Error('payment link not found');
    return {
      paymentLinkId,
      orderCode: link.orderCode,
      amount: link.amount,
      amountPaid: link.amount,
      amountRemaining: 0,
      status: 'PAID',
      transactions: [
        {
          reference: 'e2e-bank-ref',
          amount: link.amount,
          transactionDateTime: '2026-10-05 10:00:00',
        },
      ],
    };
  },
};

const noOpEmailQueue: IEmailQueue = {
  add: async () => undefined,
  recoverReminderDelivery: async () => 'MISSING',
  runWithReceivableDeliveryLock: async <T>(
    _organizationId: string,
    _receivableId: string,
    operation: (signal: AbortSignal) => Promise<T>,
  ) => ({
    acquired: true as const,
    value: await operation(new AbortController().signal),
    leaseLost: false,
  }),
  runWithReminderDeliveryLock: async <T>(
    _executionId: string,
    operation: () => Promise<T>,
  ) => ({
    acquired: true as const,
    value: await operation(),
    leaseLost: false,
  }),
  isReminderJobFailureCurrent: async () => false,
};

describe('Renewal & non-renewal downgrade (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let redis: StartedTestContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let reminderScanner: RenewalReminderScannerService;
  let downgradeScanner: NonRenewalDowngradeScannerService;

  beforeAll(async () => {
    redis = await startTestRedis();
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.JWT_SECRET = 'e2e-jwt-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'e2e-resend-key';
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'e2e-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'e2e-secret';
    process.env.PAYOS_CLIENT_ID = 'e2e-payos-client';
    process.env.PAYOS_API_KEY = 'e2e-payos-key';
    process.env.PAYOS_CHECKSUM_KEY = CHECKSUM_KEY;
    process.env.PAYOS_RETURN_URL_ALLOWLIST = 'https://app.casso.vn';

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
      .overrideProvider(PAYOS_PAYMENT_ADAPTER)
      .useValue(fakeAdapter)
      .overrideProvider(EMAIL_QUEUE_PORT)
      .useValue(noOpEmailQueue)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = moduleRef.get(DataSource);
    reminderScanner = moduleRef.get(RenewalReminderScannerService);
    downgradeScanner = moduleRef.get(NonRenewalDowngradeScannerService);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await Promise.all([redis.stop(), container.stop()]);
  }, 60_000);

  async function setUpOrgWithStarterSubscription(
    organizationId: string,
    periodStart: Date,
    periodEnd: Date,
  ) {
    const userId = organizationId.replace('00000000-0000', '33333333-3333');
    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Renewal Test Owner',
      email: `renewal-test-${organizationId}@example.com`,
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
    await dataSource.getRepository(SubscriptionOrmEntity).save({
      id: organizationId.replace('00000000-0000', '44444444-4444'),
      organizationId,
      planId: PlanId.STARTER,
      receivableMonthlyLimit: 500,
      bankConnectionLimit: 2,
      copilotChatMonthlyLimit: 100,
      canUseCustomSmtp: false,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      createdAt: periodStart,
    });
  }

  it('reminder scanner creates a PeriodCharge and a webhook confirms it as renewal', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000601';
    const now = new Date('2026-08-28T00:00:00Z');
    const periodEnd = new Date('2026-08-31T00:00:00Z'); // 3 days from `now`
    await setUpOrgWithStarterSubscription(
      organizationId,
      new Date('2026-08-01T00:00:00Z'),
      periodEnd,
    );

    await reminderScanner.scan(now);

    const charge = await dataSource
      .getRepository(PeriodChargeOrmEntity)
      .findOneOrFail({ where: { organizationId } });
    expect(charge.status).toBe('PENDING');
    const orderCode = Number(charge.orderCode) + 100_000_000;

    const webhookData = {
      orderCode,
      amount: 299000,
      description: 'Gia han goi STARTER',
      code: '00',
      desc: 'success',
      paymentLinkId: charge.payosPaymentLinkId,
      reference: 'e2e-bank-ref',
      transactionDateTime: '2026-10-05 10:00:00',
    };
    await request(app.getHttpServer())
      .post('/api/v1/payos/webhook')
      .send({
        code: '00',
        desc: 'success',
        success: true,
        data: webhookData,
        signature: signWebhookData(webhookData),
      })
      .expect(200);

    const paidCharge = await dataSource
      .getRepository(PeriodChargeOrmEntity)
      .findOneOrFail({ where: { organizationId } });
    expect(paidCharge.status).toBe('PAID');
    const receipts = await dataSource
      .getRepository(PlanPaymentHistoryOrmEntity)
      .findBy({ organizationId });
    expect(receipts).toHaveLength(1);
    expect(receipts[0].sourceType).toBe('PERIOD_CHARGE');
    expect(receipts[0].initialOutcome).toBe('ACCEPTED');

    // Subscription plan is unchanged by a renewal — only the charge status moved.
    const subscriptionRow = await dataSource
      .getRepository(SubscriptionOrmEntity)
      .findOneOrFail({ where: { organizationId } });
    expect(subscriptionRow.planId).toBe(PlanId.STARTER);
  });

  it('downgrade scanner reverts an unpaid subscription to FREE after the grace window', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000602';
    const graceCutoff = new Date('2026-09-04T00:00:00Z');
    const periodEnd = new Date(graceCutoff.getTime() - 3 * 24 * 60 * 60 * 1000);
    const periodStart = new Date(
      periodEnd.getTime() - 31 * 24 * 60 * 60 * 1000,
    );
    await setUpOrgWithStarterSubscription(
      organizationId,
      periodStart,
      periodEnd,
    );

    await downgradeScanner.scan(graceCutoff);

    const subscriptionRow = await dataSource
      .getRepository(SubscriptionOrmEntity)
      .findOneOrFail({ where: { organizationId } });
    expect(subscriptionRow.planId).toBe(PlanId.FREE);
  });

  it('downgrade scanner leaves a PAID subscription alone', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000603';
    const graceCutoff = new Date('2026-09-04T00:00:00Z');
    const periodEnd = new Date(graceCutoff.getTime() - 3 * 24 * 60 * 60 * 1000);
    const periodStart = new Date(
      periodEnd.getTime() - 31 * 24 * 60 * 60 * 1000,
    );
    await setUpOrgWithStarterSubscription(
      organizationId,
      periodStart,
      periodEnd,
    );
    await dataSource.getRepository(PeriodChargeOrmEntity).save({
      organizationId,
      planId: PlanId.STARTER,
      periodStart,
      periodEnd,
      status: PeriodChargeStatus.PAID,
      createdAt: periodStart,
      updatedAt: periodStart,
    });

    await downgradeScanner.scan(graceCutoff);

    const subscriptionRow = await dataSource
      .getRepository(SubscriptionOrmEntity)
      .findOneOrFail({ where: { organizationId } });
    expect(subscriptionRow.planId).toBe(PlanId.STARTER);
  });
});
