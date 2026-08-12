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
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

describe('Plan upgrade (integration)', () => {
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

  async function setUpOrg(organizationId: string, role: Role) {
    const userId = '00000000-0000-4000-8000-000000000400';

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Test User',
      email: 'plan-upgrade-test@example.com',
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

  it('upgrades an OWNER-owned FREE subscription to STARTER', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000401';
    const { token } = await setUpOrg(organizationId, Role.OWNER);

    const now = new Date();
    await dataSource.getRepository(SubscriptionOrmEntity).save({
      id: '00000000-0000-4000-8000-000000000402',
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

    const res = await request(app.getHttpServer())
      .post('/api/v1/subscriptions/change-plan')
      .set('Authorization', `Bearer ${token}`)
      .send({ planId: PlanId.STARTER })
      .expect(201);

    expect(res.body.planId).toBe(PlanId.STARTER);
    expect(res.body.receivableMonthlyLimit).toBe(500);
    expect(res.body.organizationId).toBeUndefined();
    expect(res.body.version).toBeUndefined();

    const row = await dataSource
      .getRepository(SubscriptionOrmEntity)
      .findOne({ where: { organizationId } });
    expect(row?.planId).toBe(PlanId.STARTER);
  });

  it('rejects a downgrade with 400 INVALID_PLAN_TRANSITION', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000403';
    const { token } = await setUpOrg(organizationId, Role.OWNER);

    const now = new Date();
    await dataSource.getRepository(SubscriptionOrmEntity).save({
      id: '00000000-0000-4000-8000-000000000404',
      organizationId,
      planId: PlanId.BUSINESS,
      receivableMonthlyLimit: 5000,
      bankConnectionLimit: 5,
      copilotChatMonthlyLimit: 1000,
      canUseCustomSmtp: true,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      ),
      currentPeriodEnd: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
      ),
      createdAt: now,
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/subscriptions/change-plan')
      .set('Authorization', `Bearer ${token}`)
      .send({ planId: PlanId.STARTER })
      .expect(400);

    expect(res.body.errorCode).toBe('INVALID_PLAN_TRANSITION');
  });

  it('forbids a VIEWER from changing the plan', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000405';
    const { token } = await setUpOrg(organizationId, Role.VIEWER);

    await request(app.getHttpServer())
      .post('/api/v1/subscriptions/change-plan')
      .set('Authorization', `Bearer ${token}`)
      .send({ planId: PlanId.STARTER })
      .expect(403);
  });
});
