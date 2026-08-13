import { createHmac } from 'node:crypto';
import { PlanId, SubscriptionStatus } from '@casso-ledger/shared-types';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { SubscriptionOrmEntity } from '../src/modules/billing/infrastructure/subscription.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import type { IPayosPaymentAdapter } from '../src/modules/payos/application/payos-payment-adapter.port';
import { PAYOS_PAYMENT_ADAPTER } from '../src/modules/payos/application/payos-payment-adapter.port';
import { PlanUpgradeOrderOrmEntity } from '../src/modules/payos/infrastructure/plan-upgrade-order.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

const CHECKSUM_KEY = 'e2e-payos-checksum-key';

function signWebhookData(data: Record<string, unknown>): string {
  const query = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k] ?? ''}`)
    .join('&');
  return createHmac('sha256', CHECKSUM_KEY).update(query).digest('hex');
}

const fakeAdapter: IPayosPaymentAdapter = {
  createPaymentLink: async (input) => ({
    checkoutUrl: `https://pay.payos.vn/${input.orderCode}`,
    orderCode: input.orderCode,
  }),
};

describe('PayOS plan upgrade (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

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
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  }, 60_000);

  async function setUpOrg(organizationId: string, role: Role) {
    const userId = organizationId.replace('00000000-0000', '22222222-2222');
    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'PayOS Test User',
      email: `payos-test-${organizationId}@example.com`,
      passwordHash: 'test-hash',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      organizationId,
      userId,
      role,
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });
    const token = jwtService.sign({ userId, organizationId, role });
    return { token };
  }

  async function seedFreeSubscription(organizationId: string) {
    const now = new Date();
    await dataSource.getRepository(SubscriptionOrmEntity).save({
      id: organizationId.replace('00000000-0000', '11111111-1111'),
      organizationId,
      planId: PlanId.FREE,
      receivableMonthlyLimit: 50,
      bankConnectionLimit: 1,
      copilotChatMonthlyLimit: 50,
      canUseCustomSmtp: false,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      ),
      currentPeriodEnd: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
      ),
      createdAt: now,
    });
  }

  it('creates a checkout link, then a PAID webhook confirms the plan upgrade', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000501';
    const { token } = await setUpOrg(organizationId, Role.OWNER);
    await seedFreeSubscription(organizationId);

    const initiateRes = await request(app.getHttpServer())
      .post('/api/v1/payos/plan-upgrade-orders')
      .set('Authorization', `Bearer ${token}`)
      .set('idempotency-key', 'test-key-1')
      .send({
        targetPlanId: PlanId.STARTER,
        returnUrl: 'https://app.casso.vn/billing?status=success',
        cancelUrl: 'https://app.casso.vn/billing?status=cancelled',
      })
      .expect(201);

    expect(initiateRes.body.checkoutUrl).toMatch(/^https:\/\/pay\.payos\.vn\//);

    const order = await dataSource
      .getRepository(PlanUpgradeOrderOrmEntity)
      .findOneOrFail({ where: { organizationId } });
    const orderCode = Number(order.orderCode);

    const webhookData = {
      orderCode,
      amount: 299000,
      description: 'Nang cap goi STARTER',
      code: '00',
      desc: 'success',
    };
    const webhookRes = await request(app.getHttpServer())
      .post('/api/v1/payos/webhook')
      .send({
        code: '00',
        desc: 'success',
        success: true,
        data: webhookData,
        signature: signWebhookData(webhookData),
      });
    if (webhookRes.status !== 200) {
      console.error(
        'Webhook error response:',
        webhookRes.status,
        webhookRes.body,
      );
    }
    expect(webhookRes.status).toBe(200);

    const subscriptionRow = await dataSource
      .getRepository(SubscriptionOrmEntity)
      .findOneOrFail({ where: { organizationId } });
    expect(subscriptionRow.planId).toBe(PlanId.STARTER);

    const orderRow = await dataSource
      .getRepository(PlanUpgradeOrderOrmEntity)
      .findOneOrFail({ where: { organizationId } });
    expect(orderRow.status).toBe('PAID');
  });

  it('replaying the same PAID webhook is a no-op (idempotent)', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000502';
    const { token } = await setUpOrg(organizationId, Role.OWNER);
    await seedFreeSubscription(organizationId);

    await request(app.getHttpServer())
      .post('/api/v1/payos/plan-upgrade-orders')
      .set('Authorization', `Bearer ${token}`)
      .set('idempotency-key', 'test-key-2')
      .send({
        targetPlanId: PlanId.STARTER,
        returnUrl: 'https://app.casso.vn/billing',
        cancelUrl: 'https://app.casso.vn/billing',
      })
      .expect(201);

    const order = await dataSource
      .getRepository(PlanUpgradeOrderOrmEntity)
      .findOneOrFail({ where: { organizationId } });
    const orderCode = Number(order.orderCode);
    const webhookData = {
      orderCode,
      amount: 299000,
      description: 'x',
      code: '00',
      desc: 'success',
    };
    const body = {
      code: '00',
      desc: 'success',
      success: true,
      data: webhookData,
      signature: signWebhookData(webhookData),
    };

    await request(app.getHttpServer())
      .post('/api/v1/payos/webhook')
      .send(body)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/payos/webhook')
      .send(body)
      .expect(200);

    const subRow = await dataSource
      .getRepository(SubscriptionOrmEntity)
      .findOneOrFail({ where: { organizationId } });
    expect(subRow.planId).toBe(PlanId.STARTER);
  });

  it('rejects a webhook with a bad signature', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/payos/webhook')
      .send({
        code: '00',
        desc: 'success',
        success: true,
        data: {
          orderCode: 999999,
          amount: 1,
          description: 'x',
          code: '00',
          desc: 'success',
        },
        signature: 'not-a-real-signature',
      })
      .expect(401);
  });
});
