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
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

describe('Billing quota enforcement (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();

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
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  async function setUpOrg(organizationId: string) {
    const userId = '00000000-0000-4000-8000-000000000100';
    const customerId = '00000000-0000-4000-8000-000000000101';

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Test User',
      email: 'billing-test@example.com',
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
      name: 'Công ty C',
      taxCode: '0398765432',
      email: 'ap@congtyc.vn',
      phone: '0911111111',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      createdAt: new Date(),
    });

    const token = jwtService.sign({ userId, organizationId, role: Role.OWNER });
    return { customerId, token };
  }

  it('hard-blocks a new Receivable with 402 once the monthly plan limit is reached', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000200';
    const { customerId, token } = await setUpOrg(organizationId);

    const now = new Date();
    await dataSource.getRepository(SubscriptionOrmEntity).save({
      id: '00000000-0000-4000-8000-000000000201',
      organizationId,
      planId: PlanId.FREE,
      receivableMonthlyLimit: 1,
      bankConnectionLimit: 1,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      ),
      currentPeriodEnd: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
      ),
      createdAt: now,
    });

    await request(app.getHttpServer())
      .post('/api/v1/receivables')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'quota-test-1')
      .send({
        customerId,
        originalAmount: 5_000_000,
        dueDate: '2026-09-01T00:00:00.000Z',
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/v1/receivables')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'quota-test-2')
      .send({
        customerId,
        originalAmount: 5_000_000,
        dueDate: '2026-09-01T00:00:00.000Z',
      })
      .expect(402);

    expect(res.body.errorCode).toBe('PLAN_LIMIT_EXCEEDED');
  });

  it('lazily provisions a FREE subscription for an organization with none yet', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000300';
    const { customerId, token } = await setUpOrg(organizationId);

    await request(app.getHttpServer())
      .post('/api/v1/receivables')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'quota-test-3')
      .send({
        customerId,
        originalAmount: 5_000_000,
        dueDate: '2026-09-01T00:00:00.000Z',
      })
      .expect(201);

    const subscriptionRow = await dataSource
      .getRepository(SubscriptionOrmEntity)
      .findOne({ where: { organizationId } });
    expect(subscriptionRow?.planId).toBe(PlanId.FREE);
  });
});
