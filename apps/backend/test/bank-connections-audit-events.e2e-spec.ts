import { randomUUID } from 'node:crypto';
import { PlanId, SubscriptionStatus } from '@casso-ar/shared-types';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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
import { CASSO_FLOW_INTEGRATION_ADAPTER } from '../src/modules/bank-connections/application/casso-flow-integration-adapter.port';
import { BankConnectionOrmEntity } from '../src/modules/bank-connections/infrastructure/bank-connection.orm-entity';
import { SubscriptionOrmEntity } from '../src/modules/billing/infrastructure/subscription.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { OrganizationOrmEntity } from '../src/modules/organizations/infrastructure/organization.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';
import { startTestRedis } from './helpers/test-redis';

describe('Bank connections audit events (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let redis: StartedTestContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  const mockCassoAdapter = {
    getAccountInfo: jest.fn().mockImplementation((apiKey: string) => {
      if (apiKey === 'new-api-key-1234') {
        return Promise.resolve({
          businessId: 'biz-e2e',
          accounts: [
            {
              accountNumber: '123456789',
              bankName: 'Rotated Bank',
              accountHolderName: 'NEW HOLDER',
            },
          ],
        });
      }
      return Promise.resolve({
        businessId: 'biz-e2e',
        accounts: [
          {
            accountNumber: '123456789',
            bankName: 'Initial Bank',
            accountHolderName: 'OLD HOLDER',
          },
        ],
      });
    }),
    registerWebhook: jest.fn().mockResolvedValue(undefined),
    invalidateToken: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.JWT_SECRET = 'e2e-jwt-secret';
    process.env.RESEND_API_KEY = 'e2e-resend-key';

    redis = await startTestRedis();
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
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
      .overrideProvider(CASSO_FLOW_INTEGRATION_ADAPTER)
      .useValue(mockCassoAdapter)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await Promise.all([redis.stop(), container.stop()]);
  });

  it('lets FINANCE_MANAGER manage connections and records their audit history', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000401';
    const ownerUserId = '00000000-0000-4000-8000-000000000402';
    const accountantUserId = '00000000-0000-4000-8000-000000000403';
    const financeManagerUserId = '00000000-0000-4000-8000-000000000405';
    const viewerUserId = '00000000-0000-4000-8000-000000000406';

    await dataSource.getRepository(OrganizationOrmEntity).save({
      id: organizationId,
      name: 'E2E Test Org',
      createdAt: new Date(),
    });

    const now = new Date();
    await dataSource.getRepository(SubscriptionOrmEntity).save({
      id: '00000000-0000-4000-8000-000000000404',
      organizationId,
      planId: PlanId.ENTERPRISE,
      receivableMonthlyLimit: 1000,
      bankConnectionLimit: 10,
      copilotChatMonthlyLimit: 100,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      ),
      currentPeriodEnd: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
      ),
      createdAt: now,
    });

    await dataSource.getRepository(UserOrmEntity).save([
      {
        id: ownerUserId,
        name: 'Owner User',
        email: 'owner@example.com',
        passwordHash: 'test-hash',
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: accountantUserId,
        name: 'Accountant User',
        email: 'accountant@example.com',
        passwordHash: 'test-hash',
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: financeManagerUserId,
        name: 'Finance Manager User',
        email: 'finance-manager@example.com',
        passwordHash: 'test-hash',
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: viewerUserId,
        name: 'Viewer User',
        email: 'viewer@example.com',
        passwordHash: 'test-hash',
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
      },
    ]);

    await dataSource.getRepository(MembershipOrmEntity).save([
      {
        organizationId,
        userId: ownerUserId,
        role: Role.OWNER,
        invitedAt: new Date(),
        joinedAt: new Date(),
        createdAt: new Date(),
      },
      {
        organizationId,
        userId: accountantUserId,
        role: Role.ACCOUNTANT,
        invitedAt: new Date(),
        joinedAt: new Date(),
        createdAt: new Date(),
      },
      {
        organizationId,
        userId: financeManagerUserId,
        role: Role.FINANCE_MANAGER,
        invitedAt: new Date(),
        joinedAt: new Date(),
        createdAt: new Date(),
      },
      {
        organizationId,
        userId: viewerUserId,
        role: Role.VIEWER,
        invitedAt: new Date(),
        joinedAt: new Date(),
        createdAt: new Date(),
      },
    ]);

    const ownerToken = jwtService.sign({
      userId: ownerUserId,
      organizationId,
      role: Role.OWNER,
    });
    const accountantToken = jwtService.sign({
      userId: accountantUserId,
      organizationId,
      role: Role.ACCOUNTANT,
    });
    const financeManagerToken = jwtService.sign({
      userId: financeManagerUserId,
      organizationId,
      role: Role.FINANCE_MANAGER,
    });
    const viewerToken = jwtService.sign({
      userId: viewerUserId,
      organizationId,
      role: Role.VIEWER,
    });

    await request(app.getHttpServer())
      .post('/api/v1/bank-connections/casso-flow/preview')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ apiKey: 'initial-key-0000' })
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/v1/bank-connections')
      .set('Authorization', `Bearer ${financeManagerToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/bank-connections')
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(403);

    // 1. Connect as FINANCE_MANAGER
    const connectRes = await request(app.getHttpServer())
      .post('/api/v1/bank-connections/casso-flow/confirm')
      .set('Authorization', `Bearer ${financeManagerToken}`)
      .set('Idempotency-Key', 'e2e-connect-key-1')
      .send({
        apiKey: 'initial-key-0000',
        selectedAccountNumbers: ['123456789'],
      })
      .expect(201);

    expect(connectRes.body.connected).toHaveLength(1);
    const connectionId = connectRes.body.connected[0].connectionId;

    const connectionRow = await dataSource
      .getRepository(BankConnectionOrmEntity)
      .findOneByOrFail({ id: connectionId });
    const authorizationId = connectionRow.cassoFlowAuthorizationId;

    // 2. Rotate as FINANCE_MANAGER
    await request(app.getHttpServer())
      .post(
        `/api/v1/bank-connections/authorizations/${authorizationId}/casso-flow/confirm`,
      )
      .set('Authorization', `Bearer ${financeManagerToken}`)
      .set('Idempotency-Key', 'e2e-rotate-key-1')
      .send({ apiKey: 'new-api-key-1234' })
      .expect(201);

    // 3. Disconnect as FINANCE_MANAGER
    await request(app.getHttpServer())
      .post(`/api/v1/bank-connections/${connectionId}/disconnect`)
      .set('Authorization', `Bearer ${financeManagerToken}`)
      .set('Idempotency-Key', 'e2e-disconnect-key-1')
      .send()
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/bank-connections/${connectionId}/disconnect`)
      .set('Authorization', `Bearer ${accountantToken}`)
      .send()
      .expect(403);

    // 4. List audit events as OWNER -> 200
    const historyRes = await request(app.getHttpServer())
      .get(
        `/api/v1/bank-connections/authorizations/${authorizationId}/audit-events`,
      )
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(historyRes.body.total).toBe(3);
    expect(historyRes.body.items).toHaveLength(3);

    const [event1, event2, event3] = historyRes.body.items;

    // Newest first: DISCONNECTED
    expect(event1.eventType).toBe('DISCONNECTED');
    expect(event1.actorUserId).toBe(financeManagerUserId);

    // Second: API_KEY_ROTATED
    expect(event2.eventType).toBe('API_KEY_ROTATED');
    expect(event2.actorUserId).toBe(financeManagerUserId);
    expect(event2.oldMaskedApiKey).toBe('••••0000');
    expect(event2.newMaskedApiKey).toBe('••••1234');
    expect(event2.oldBankName).toBe('Initial Bank');
    expect(event2.newBankName).toBe('Rotated Bank');
    expect(event2.oldAccountHolderName).toBe('OLD HOLDER');
    expect(event2.newAccountHolderName).toBe('NEW HOLDER');

    // Third: TOKEN_EXCHANGED
    expect(event3.eventType).toBe('TOKEN_EXCHANGED');
    expect(event3.actorUserId).toBe(financeManagerUserId);
    expect(event3.maskedApiKey).toBe('••••0000');

    // 5. List audit events as ACCOUNTANT -> 403 Forbidden
    await request(app.getHttpServer())
      .get(
        `/api/v1/bank-connections/authorizations/${authorizationId}/audit-events`,
      )
      .set('Authorization', `Bearer ${accountantToken}`)
      .expect(403);

    // 6. List audit events for a non-existent authorization -> 404 Not Found
    await request(app.getHttpServer())
      .get(
        `/api/v1/bank-connections/authorizations/${randomUUID()}/audit-events`,
      )
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);

    // 7. Cross-tenant: an OWNER in a different organization must not see
    // this organization's history, even for an id that exists elsewhere.
    const otherOrganizationId = '00000000-0000-4000-8000-000000000501';
    const otherOwnerUserId = '00000000-0000-4000-8000-000000000502';

    await dataSource.getRepository(OrganizationOrmEntity).save({
      id: otherOrganizationId,
      name: 'E2E Other Org',
      createdAt: new Date(),
    });
    await dataSource.getRepository(UserOrmEntity).save({
      id: otherOwnerUserId,
      name: 'Other Owner',
      email: 'other-owner@example.com',
      passwordHash: 'test-hash',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      organizationId: otherOrganizationId,
      userId: otherOwnerUserId,
      role: Role.OWNER,
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });

    const otherOwnerToken = jwtService.sign({
      userId: otherOwnerUserId,
      organizationId: otherOrganizationId,
      role: Role.OWNER,
    });

    await request(app.getHttpServer())
      .get(
        `/api/v1/bank-connections/authorizations/${authorizationId}/audit-events`,
      )
      .set('Authorization', `Bearer ${otherOwnerToken}`)
      .expect(404);

    // 8. A malformed (non-UUID) authorization id must fail input validation,
    // not crash into a raw Postgres error surfaced as a 500.
    const malformedRes = await request(app.getHttpServer())
      .get('/api/v1/bank-connections/authorizations/not-a-uuid/audit-events')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);
    expect(malformedRes.body.errorCode).toBe('VALIDATION_ERROR');
  }, 30_000);
});
