import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { StartedTestContainer } from 'testcontainers';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import {
  AuditActionType,
  AuditEntityType,
} from '../src/common/audit/audit.enums';
import { AuditLogOrmEntity } from '../src/common/audit/audit-log.orm-entity';
import { configureApp } from '../src/configure-app';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';
import { WEBHOOK_JOB_QUEUE } from '../src/modules/webhooks/application/webhook-job-queue.port';
import { WebhookInboxOrmEntity } from '../src/modules/webhooks/infrastructure/webhook-inbox.orm-entity';
import { startTestRedis } from './helpers/test-redis';

describe('Audit logs + webhook inbox admin APIs (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let redis: StartedTestContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;
  const enqueue = jest.fn().mockResolvedValue(undefined);

  const orgA = '00000000-0000-0000-0000-00000000000a';
  const orgB = '00000000-0000-0000-0000-00000000000b';
  const ownerA = '00000000-0000-0000-0000-0000000000a1';
  const viewerA = '00000000-0000-0000-0000-0000000000a2';
  const ownerB = '00000000-0000-0000-0000-0000000000b1';

  const logId = '00000000-0000-0000-0000-0000000000c1';
  const receivableForFilterTest = '00000000-0000-4000-8000-0000000000e1';
  const inboxId = '00000000-0000-0000-0000-0000000000d1';

  function token(userId: string, organizationId: string, role: Role) {
    return jwtService.sign({ userId, organizationId, role });
  }

  // Audit log writes are fire-and-forget, so poll instead of asserting
  // immediately after the triggering request resolves.
  async function waitForAuditCount(
    actionType: AuditActionType,
    entityId: string,
    expectedCount: number,
  ) {
    const auditRepo = dataSource.getRepository(AuditLogOrmEntity);
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const count = await auditRepo.count({
        where: { organizationId: orgA, actionType, entityId },
      });
      if (count >= expectedCount) return;
      await delay(100);
    }
    throw new Error(
      `Audit log count for ${actionType}/${entityId} never reached ${expectedCount}`,
    );
  }

  beforeAll(async () => {
    redis = await startTestRedis();
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.JWT_SECRET = 'ops-apis-e2e-jwt-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'ops-apis-e2e-resend-key';
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
      .overrideProvider(WEBHOOK_JOB_QUEUE)
      .useValue({ enqueue })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    configureApp(app);
    await app.init();
    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);

    await dataSource.getRepository(UserOrmEntity).save([
      {
        id: ownerA,
        name: 'Owner A',
        email: 'owner-a@example.com',
        passwordHash: 'h',
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: viewerA,
        name: 'Viewer A',
        email: 'viewer-a@example.com',
        passwordHash: 'h',
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: ownerB,
        name: 'Owner B',
        email: 'owner-b@example.com',
        passwordHash: 'h',
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
        userId: viewerA,
        role: Role.VIEWER,
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

    await dataSource.getRepository(AuditLogOrmEntity).save([
      {
        id: logId,
        organizationId: orgA,
        userId: ownerA,
        actionType: AuditActionType.PAYMENT_ALLOCATE,
        entityType: AuditEntityType.PAYMENT,
        entityId: 'payment-1',
        beforeState: null,
        afterState: { amount: 1000 },
        ipAddress: '203.0.113.5',
        createdAt: new Date('2026-08-12'),
      },
      {
        id: randomUUID(),
        organizationId: orgB,
        userId: ownerB,
        actionType: AuditActionType.AUTH_LOGIN,
        entityType: AuditEntityType.AUTH,
        entityId: 'auth-1',
        beforeState: null,
        afterState: null,
        ipAddress: '203.0.113.6',
        createdAt: new Date('2026-08-12'),
      },
      {
        id: randomUUID(),
        organizationId: orgA,
        userId: ownerA,
        actionType: AuditActionType.PAYMENT_ALLOCATE,
        entityType: AuditEntityType.PAYMENT_ALLOCATION,
        entityId: 'alloc-1',
        relatedReceivableId: receivableForFilterTest,
        beforeState: null,
        afterState: {
          receivableId: receivableForFilterTest,
          allocatedAmount: 500000,
        },
        ipAddress: null,
        createdAt: new Date('2026-08-13'),
      },
      {
        id: randomUUID(),
        organizationId: orgB,
        userId: ownerB,
        actionType: AuditActionType.PAYMENT_ALLOCATE,
        entityType: AuditEntityType.PAYMENT_ALLOCATION,
        entityId: 'alloc-2',
        // Same relatedReceivableId as the orgA row above, on purpose: proves
        // the receivableId filter stays AND'ed with organizationId instead
        // of leaking across tenants when two orgs coincidentally reuse an id.
        relatedReceivableId: receivableForFilterTest,
        beforeState: null,
        afterState: {
          receivableId: receivableForFilterTest,
          allocatedAmount: 999999,
        },
        ipAddress: null,
        createdAt: new Date('2026-08-13'),
      },
    ]);

    await dataSource.getRepository(WebhookInboxOrmEntity).save([
      {
        id: inboxId,
        organizationId: orgA,
        bankConnectionId: 'conn-1',
        providerTransactionId: 'txn-1',
        rawPayload: { amount: 1000 },
        receivedAt: new Date('2026-08-12'),
        status: 'FAILED',
        processedAt: null,
        errorMessage: 'match failed',
        retryCount: 5,
      },
      {
        id: randomUUID(),
        organizationId: orgA,
        bankConnectionId: 'conn-1',
        providerTransactionId: 'txn-2',
        rawPayload: { amount: 500 },
        receivedAt: new Date('2026-08-12'),
        status: 'PROCESSED',
        processedAt: new Date('2026-08-12'),
        errorMessage: null,
        retryCount: 0,
      },
    ]);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await Promise.all([redis.stop(), container.stop()]);
  });

  it('GET /audit-logs returns only the caller organization logs', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .expect(200);

    expect(response.body.total).toBe(2);
    expect(response.body.items).toHaveLength(2);
    const paymentLog = response.body.items.find(
      (item: { id: string }) => item.id === logId,
    );
    expect(paymentLog).toMatchObject({
      actionType: 'PAYMENT_ALLOCATE',
      entityType: 'Payment',
    });
    expect(paymentLog.organizationId).toBeUndefined();
  });

  it('GET /audit-logs filters by actionType', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/audit-logs?actionType=AUTH_LOGIN')
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .expect(200);

    expect(response.body.total).toBe(0);
  });

  it('GET /audit-logs filters by receivableId', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/audit-logs?receivableId=${receivableForFilterTest}`)
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items[0]).toMatchObject({
      entityId: 'alloc-1',
      entityType: 'PaymentAllocation',
    });
  });

  it('GET /audit-logs filters by receivableId stay scoped to the caller organization', async () => {
    // orgB has a row with the same relatedReceivableId (see fixture setup) —
    // this proves the filter is AND'ed with organizationId, not applied alone.
    const responseA = await request(app.getHttpServer())
      .get(`/api/v1/audit-logs?receivableId=${receivableForFilterTest}`)
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .expect(200);
    expect(responseA.body.total).toBe(1);
    expect(responseA.body.items[0].entityId).toBe('alloc-1');

    const responseB = await request(app.getHttpServer())
      .get(`/api/v1/audit-logs?receivableId=${receivableForFilterTest}`)
      .set('Authorization', `Bearer ${token(ownerB, orgB, Role.OWNER)}`)
      .expect(200);
    expect(responseB.body.total).toBe(1);
    expect(responseB.body.items[0].entityId).toBe('alloc-2');
  });

  it('GET /webhooks/inbox lists inbox rows tenant-scoped with status filter', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/webhooks/inbox?status=FAILED')
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items[0]).toMatchObject({
      id: inboxId,
      status: 'FAILED',
      errorMessage: 'match failed',
      retryCount: 5,
    });
    expect(response.body.items[0].organizationId).toBeUndefined();
  });

  it('GET /webhooks/inbox filters by providerTransactionId', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/webhooks/inbox?providerTransactionId=txn-2')
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items[0].providerTransactionId).toBe('txn-2');
  });

  it('reprocesses a FAILED webhook idempotently', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/webhooks/inbox/${inboxId}/reprocess`)
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .set('Idempotency-Key', randomUUID())
      .expect(200);

    expect(response.body.id).toBe(inboxId);

    const again = await request(app.getHttpServer())
      .post(`/api/v1/webhooks/inbox/${inboxId}/reprocess`)
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .set('Idempotency-Key', randomUUID())
      .expect(200);
    expect(again.body.id).toBe(inboxId);

    expect(enqueue).toHaveBeenCalledWith({
      webhookInboxId: inboxId,
      organizationId: orgA,
      jobId: `webhook-reprocess-${inboxId}`,
    });
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue.mock.calls[0][0].jobId).toBe(enqueue.mock.calls[1][0].jobId);
  });

  it('writes an audit log for the reprocess trigger, without the raw webhook payload', async () => {
    await waitForAuditCount(AuditActionType.WEBHOOK_REPROCESS, inboxId, 2);

    const response = await request(app.getHttpServer())
      .get('/api/v1/audit-logs?actionType=WEBHOOK_REPROCESS')
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .expect(200);

    // The preceding test reprocesses the same inbox twice.
    expect(response.body.total).toBe(2);
    expect(response.body.items[0]).toMatchObject({
      userId: ownerA,
      actionType: 'WEBHOOK_REPROCESS',
      entityType: 'WebhookInbox',
      entityId: inboxId,
    });
    expect(response.body.items[0].afterState).not.toHaveProperty('rawPayload');
    expect(response.body.items[0].beforeState).not.toHaveProperty('rawPayload');
  });

  it('rejects reprocessing a webhook that is not FAILED', async () => {
    const processed = await dataSource
      .getRepository(WebhookInboxOrmEntity)
      .findOneByOrFail({ providerTransactionId: 'txn-2' });

    await request(app.getHttpServer())
      .post(`/api/v1/webhooks/inbox/${processed.id}/reprocess`)
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .set('Idempotency-Key', randomUUID())
      .expect(409)
      .expect(({ body }) => {
        expect(body.errorCode).toBe('CONFLICT');
      });
  });

  it('returns the cached response and does not re-enqueue on an Idempotency-Key replay', async () => {
    const key = `replay-${randomUUID()}`;
    const before = enqueue.mock.calls.length;

    const first = await request(app.getHttpServer())
      .post(`/api/v1/webhooks/inbox/${inboxId}/reprocess`)
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .set('Idempotency-Key', key)
      .expect(200);

    const replay = await request(app.getHttpServer())
      .post(`/api/v1/webhooks/inbox/${inboxId}/reprocess`)
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .set('Idempotency-Key', key)
      .expect(200);

    expect(replay.body).toEqual(first.body);
    expect(enqueue.mock.calls.length).toBe(before + 1);
  });

  it('enforces tenant isolation on both APIs', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${token(ownerB, orgB, Role.OWNER)}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.total).toBe(2);
        expect(body.items.map((item: { id: string }) => item.id)).not.toContain(
          logId,
        );
      });

    await request(app.getHttpServer())
      .get('/api/v1/webhooks/inbox')
      .set('Authorization', `Bearer ${token(ownerB, orgB, Role.OWNER)}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.total).toBe(0);
      });

    await request(app.getHttpServer())
      .post(`/api/v1/webhooks/inbox/${inboxId}/reprocess`)
      .set('Authorization', `Bearer ${token(ownerB, orgB, Role.OWNER)}`)
      .set('Idempotency-Key', randomUUID())
      .expect(404);
  });

  it('denies webhook inbox access to roles without WEBHOOK_INBOX_READ', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/webhooks/inbox')
      .set('Authorization', `Bearer ${token(viewerA, orgA, Role.VIEWER)}`)
      .expect(403);
  });
});
