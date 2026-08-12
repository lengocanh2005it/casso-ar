import { randomUUID } from 'node:crypto';
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

describe('Audit logs + webhook inbox admin APIs (integration)', () => {
  let container: StartedPostgreSqlContainer;
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
  const inboxId = '00000000-0000-0000-0000-0000000000d1';

  function token(userId: string, organizationId: string, role: Role) {
    return jwtService.sign({ userId, organizationId, role });
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
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
    await container.stop();
  });

  it('GET /audit-logs returns only the caller organization logs', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      id: logId,
      actionType: 'PAYMENT_ALLOCATE',
      entityType: 'Payment',
    });
    expect(response.body.items[0].organizationId).toBeUndefined();
  });

  it('GET /audit-logs filters by actionType', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/audit-logs?actionType=AUTH_LOGIN')
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .expect(200);

    expect(response.body.total).toBe(0);
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
      .expect(200);

    expect(response.body.id).toBe(inboxId);

    const again = await request(app.getHttpServer())
      .post(`/api/v1/webhooks/inbox/${inboxId}/reprocess`)
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
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

  it('rejects reprocessing a webhook that is not FAILED', async () => {
    const processed = await dataSource
      .getRepository(WebhookInboxOrmEntity)
      .findOneByOrFail({ providerTransactionId: 'txn-2' });

    await request(app.getHttpServer())
      .post(`/api/v1/webhooks/inbox/${processed.id}/reprocess`)
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .expect(409)
      .expect(({ body }) => {
        expect(body.errorCode).toBe('CONFLICT');
      });
  });

  it('enforces tenant isolation on both APIs', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${token(ownerB, orgB, Role.OWNER)}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.total).toBe(1);
        expect(body.items[0].id).not.toBe(logId);
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
      .expect(404);
  });

  it('denies webhook inbox access to roles without WEBHOOK_INBOX_READ', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/webhooks/inbox')
      .set('Authorization', `Bearer ${token(viewerA, orgA, Role.VIEWER)}`)
      .expect(403);
  });
});
