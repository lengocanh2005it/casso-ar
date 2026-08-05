import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

describe('Cas ID bank connection flow (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  beforeAll(async () => {
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    container = await new PostgreSqlContainer('postgres:16').start();

    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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

  it('connects, exchanges the token, and disconnects a bank connection end to end', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000101';
    const userId = '00000000-0000-4000-8000-000000000102';

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Bank Connection Test User',
      email: 'bank-connection-test@example.com',
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
    const token = jwtService.sign({ userId, organizationId, role: Role.OWNER });

    const initiateRes = await request(app.getHttpServer())
      .post('/api/v1/bank-connections/cas-id/initiate')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'bank-connection-flow-initiate')
      .send({ redirectUri: 'http://localhost/callback' })
      .expect(201);

    expect(initiateRes.body.sessionId).toBeDefined();
    expect(initiateRes.body.grantToken).toBeDefined();

    const sessionRow = await dataSource.query(
      'SELECT status, "organizationId" FROM cas_id_connection_sessions WHERE id = $1',
      [initiateRes.body.sessionId],
    );
    expect(sessionRow[0].status).toBe('PENDING_AUTHORIZATION');
    expect(sessionRow[0].organizationId).toBe(organizationId);

    const exchangeRes = await request(app.getHttpServer())
      .post(
        `/api/v1/bank-connections/cas-id/sessions/${initiateRes.body.sessionId}/exchange`,
      )
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'bank-connection-flow-exchange')
      .send({ publicToken: 'mock-public-token' })
      .expect(201);

    expect(exchangeRes.body.status).toBe('ACTIVE');
    const connectionId = exchangeRes.body.connectionId;

    const connectionRow = await dataSource.query(
      'SELECT status, "encryptedAccessToken", "organizationId" FROM bank_connections WHERE id = $1',
      [connectionId],
    );
    expect(connectionRow[0].status).toBe('ACTIVE');
    expect(connectionRow[0].organizationId).toBe(organizationId);
    // The raw mock access token is never persisted — only ciphertext.
    expect(connectionRow[0].encryptedAccessToken).not.toContain(
      'mock-access-token',
    );

    const auditAfterExchange = await dataSource.query(
      'SELECT "eventType" FROM connection_audit_events WHERE "bankConnectionId" = $1',
      [connectionId],
    );
    expect(auditAfterExchange).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: 'TOKEN_EXCHANGED' }),
      ]),
    );

    // Re-exchanging with the same Idempotency-Key must not create a second
    // connection row or a second TOKEN_EXCHANGED audit event.
    await request(app.getHttpServer())
      .post(
        `/api/v1/bank-connections/cas-id/sessions/${initiateRes.body.sessionId}/exchange`,
      )
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'bank-connection-flow-exchange')
      .send({ publicToken: 'mock-public-token' })
      .expect(201);
    const auditAfterReplay = await dataSource.query(
      'SELECT "eventType" FROM connection_audit_events WHERE "bankConnectionId" = $1 AND "eventType" = $2',
      [connectionId, 'TOKEN_EXCHANGED'],
    );
    expect(auditAfterReplay).toHaveLength(1);

    await request(app.getHttpServer())
      .post(`/api/v1/bank-connections/${connectionId}/disconnect`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'bank-connection-flow-disconnect')
      .send({})
      .expect(201);

    const disconnectedRow = await dataSource.query(
      'SELECT status, "revokedAt" FROM bank_connections WHERE id = $1',
      [connectionId],
    );
    expect(disconnectedRow[0].status).toBe('DISCONNECTED');
    expect(disconnectedRow[0].revokedAt).not.toBeNull();
  });
});
