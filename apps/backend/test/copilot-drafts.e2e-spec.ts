import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import request from 'supertest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { CopilotDraftOrmEntity } from '../src/modules/copilot/infrastructure/copilot-draft.orm-entity';
import { CopilotPendingActionOrmEntity } from '../src/modules/copilot/infrastructure/copilot-pending-action.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

jest.setTimeout(60_000);

describe('Copilot drafts list + reopen (e2e)', () => {
  let postgres: StartedPostgreSqlContainer | undefined;
  let redis: StartedTestContainer | undefined;
  let app: INestApplication | undefined;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let token: string;
  const organizationId = randomUUID();
  const userId = randomUUID();

  beforeAll(async () => {
    [postgres, redis] = await Promise.all([
      new PostgreSqlContainer('postgres:16').start(),
      new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
    ]);
    process.env.DB_HOST = postgres.getHost();
    process.env.DB_PORT = String(postgres.getMappedPort(5432));
    process.env.DB_USERNAME = postgres.getUsername();
    process.env.DB_PASSWORD = postgres.getPassword();
    process.env.DB_DATABASE = postgres.getDatabase();
    process.env.REDIS_HOST = redis.getHost();
    process.env.REDIS_PORT = String(redis.getMappedPort(6379));
    process.env.JWT_SECRET = 'copilot-drafts-e2e-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'copilot-drafts-test-resend-key';
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'copilot-drafts-test-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'copilot-drafts-test-secret';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideModule(TypeOrmModule)
      .useModule(
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: postgres.getHost(),
          port: postgres.getMappedPort(5432),
          username: postgres.getUsername(),
          password: postgres.getPassword(),
          database: postgres.getDatabase(),
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

    const now = new Date();
    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Drafts Owner',
      email: `drafts-owner-${organizationId}@example.com`,
      passwordHash: 'hash',
      emailVerifiedAt: now,
      createdAt: now,
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      id: randomUUID(),
      userId,
      organizationId,
      role: Role.OWNER,
      invitedAt: now,
      joinedAt: now,
      createdAt: now,
    });

    token = jwtService.sign({
      userId,
      organizationId,
      role: Role.OWNER,
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await Promise.all([redis?.stop(), postgres?.stop()]);
  });

  async function seedDraft(id: string, createdAt: Date) {
    await dataSource.getRepository(CopilotDraftOrmEntity).save({
      id,
      organizationId,
      userId,
      receivableId: randomUUID(),
      recipientEmail: 'ap@abc.vn',
      subject: `Draft ${id}`,
      bodyHtml: '<p>body</p>',
      createdAt,
    });
  }

  async function seedAction(
    draftId: string,
    status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED',
    createdAt: Date,
  ) {
    await dataSource.getRepository(CopilotPendingActionOrmEntity).save({
      id: randomUUID(),
      organizationId,
      conversationId: randomUUID(),
      actionType: 'SEND_REMINDER_EMAIL',
      payload: { draftId, receivableId: randomUUID() },
      status,
      createdAt,
      resolvedAt: status === 'PENDING' ? null : new Date(),
      resolvedByUserId: status === 'PENDING' ? null : userId,
    });
  }

  it('lists drafts with derived status and supports the status filter', async () => {
    const orphanId = randomUUID();
    const cancelledId = randomUUID();
    await seedDraft(orphanId, new Date('2026-08-14T09:00:00Z'));
    await seedDraft(cancelledId, new Date('2026-08-14T08:00:00Z'));
    await seedAction(
      cancelledId,
      'CANCELLED',
      new Date('2026-08-14T08:01:00Z'),
    );

    const listResponse = await request(app?.getHttpServer())
      .get('/api/v1/copilot/drafts')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const byId = new Map(
      (listResponse.body.items as Array<{ id: string; status: string }>).map(
        (item) => [item.id, item.status],
      ),
    );
    expect(byId.get(orphanId)).toBe('DRAFTED');
    expect(byId.get(cancelledId)).toBe('CANCELLED');

    const filteredResponse = await request(app?.getHttpServer())
      .get('/api/v1/copilot/drafts')
      .query({ status: 'CANCELLED' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(
      (filteredResponse.body.items as Array<{ id: string }>).every(
        (item) => item.id !== orphanId,
      ),
    ).toBe(true);
  });

  it('reopens a CANCELLED draft into a new PENDING action, and blocks a PENDING one', async () => {
    const cancelledDraftId = randomUUID();
    await seedDraft(cancelledDraftId, new Date('2026-08-14T07:00:00Z'));
    await seedAction(
      cancelledDraftId,
      'CANCELLED',
      new Date('2026-08-14T07:01:00Z'),
    );

    const reopenResponse = await request(app?.getHttpServer())
      .post(`/api/v1/copilot/drafts/${cancelledDraftId}/reopen`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .expect(201);

    expect(reopenResponse.body.pendingAction.status).toBe('PENDING');
    expect(reopenResponse.body.conversationId).toBeTruthy();

    const pendingDraftId = randomUUID();
    await seedDraft(pendingDraftId, new Date('2026-08-14T06:00:00Z'));
    await seedAction(pendingDraftId, 'PENDING', new Date());

    await request(app?.getHttpServer())
      .post(`/api/v1/copilot/drafts/${pendingDraftId}/reopen`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .expect(409);
  });
});
