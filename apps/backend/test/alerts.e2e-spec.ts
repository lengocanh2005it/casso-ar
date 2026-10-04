import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
import { BANK_CONNECTION_STATUS_CHANGED } from '../src/modules/bank-connections/application/mark-requires-reauthorization.usecase';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { OrganizationOrmEntity } from '../src/modules/organizations/infrastructure/organization.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';
import { startTestRedis } from './helpers/test-redis';

jest.setTimeout(60_000);

describe('In-app Alerts (e2e)', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let redis: StartedTestContainer | undefined;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let eventEmitter: EventEmitter2;

  beforeAll(async () => {
    redis = await startTestRedis();
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.JWT_SECRET = 'alerts-e2e-jwt-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'alerts-e2e-resend-key';
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'alerts-e2e-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'alerts-e2e-secret';

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
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);
    eventEmitter = moduleRef.get(EventEmitter2);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await Promise.all([redis?.stop(), container?.stop()]);
  }, 60_000);

  async function setUpOwner() {
    const organizationId = randomUUID();
    const ownerId = randomUUID();
    const now = new Date();

    await dataSource.getRepository(OrganizationOrmEntity).save({
      id: organizationId,
      name: 'Alerts Test Organization',
      createdAt: now,
    });
    await dataSource.getRepository(UserOrmEntity).save({
      id: ownerId,
      name: 'Alerts Owner',
      email: `alerts-owner-${organizationId}@example.com`,
      passwordHash: 'test-hash',
      emailVerifiedAt: now,
      createdAt: now,
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      id: randomUUID(),
      organizationId,
      userId: ownerId,
      role: Role.OWNER,
      invitedAt: now,
      joinedAt: now,
      createdAt: now,
    });

    const accessToken = jwtService.sign({
      userId: ownerId,
      organizationId,
      role: Role.OWNER,
    });
    return { organizationId, ownerId, accessToken };
  }

  it('creates an Alert on bank-connection.status.changed, dedupes a repeat unread event, and supports the full read/delete surface', async () => {
    const { organizationId, accessToken } = await setUpOwner();
    const bankConnectionId = randomUUID();

    await eventEmitter.emitAsync(BANK_CONNECTION_STATUS_CHANGED, {
      bankConnectionId,
      organizationId,
      status: 'ERROR',
    });

    const firstList = await request(app.getHttpServer())
      .get('/api/v1/alerts')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(firstList.body.total).toBe(1);
    expect(firstList.body.unreadCount).toBe(1);
    expect(firstList.body.items[0]).toMatchObject({
      type: 'BANK_CONNECTION_ERROR',
      entityType: 'bank_connection',
      entityId: bankConnectionId,
      isRead: false,
    });
    const alertId = firstList.body.items[0].id;

    await eventEmitter.emitAsync(BANK_CONNECTION_STATUS_CHANGED, {
      bankConnectionId,
      organizationId,
      status: 'ERROR',
    });

    const afterRepeat = await request(app.getHttpServer())
      .get('/api/v1/alerts')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(afterRepeat.body.total).toBe(1);

    await request(app.getHttpServer())
      .patch(`/api/v1/alerts/${alertId}/read`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const afterRead = await request(app.getHttpServer())
      .get('/api/v1/alerts')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(afterRead.body.unreadCount).toBe(0);
    expect(afterRead.body.items[0].isRead).toBe(true);

    await eventEmitter.emitAsync(BANK_CONNECTION_STATUS_CHANGED, {
      bankConnectionId,
      organizationId,
      status: 'ERROR',
    });
    const afterReadThenRepeat = await request(app.getHttpServer())
      .get('/api/v1/alerts')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(afterReadThenRepeat.body.total).toBe(2);

    await request(app.getHttpServer())
      .delete('/api/v1/alerts')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const afterDeleteAll = await request(app.getHttpServer())
      .get('/api/v1/alerts')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(afterDeleteAll.body.total).toBe(0);
  });

  it('returns 404 when marking read an alert that does not belong to the caller', async () => {
    const { accessToken: ownerAAccessToken } = await setUpOwner();
    const { organizationId: orgB, ownerId: ownerB } = await setUpOwner();
    await eventEmitter.emitAsync(BANK_CONNECTION_STATUS_CHANGED, {
      bankConnectionId: randomUUID(),
      organizationId: orgB,
      status: 'ERROR',
    });
    const orgBList = await request(app.getHttpServer())
      .get('/api/v1/alerts')
      .set(
        'Authorization',
        `Bearer ${jwtService.sign({ userId: ownerB, organizationId: orgB, role: Role.OWNER })}`,
      )
      .expect(200);
    const orgBAlertId = orgBList.body.items[0].id;

    await request(app.getHttpServer())
      .patch(`/api/v1/alerts/${orgBAlertId}/read`)
      .set('Authorization', `Bearer ${ownerAAccessToken}`)
      .expect(404);
  });
});
