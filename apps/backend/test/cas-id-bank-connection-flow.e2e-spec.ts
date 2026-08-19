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
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';
import { BankTransactionOrmEntity } from '../src/modules/webhooks/infrastructure/bank-transaction.orm-entity';
import { WebhookInboxOrmEntity } from '../src/modules/webhooks/infrastructure/webhook-inbox.orm-entity';

describe('Cas ID bank connection flow (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  beforeAll(async () => {
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.CAS_ID_WEBHOOK_IP_ALLOWLIST = '127.0.0.1,::1,::ffff:127.0.0.1';

    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.RESEND_API_KEY = 'cas-id-flow-e2e-resend-key';

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
      .send({})
      .expect(201);

    expect(initiateRes.body.sessionId).toBeDefined();
    expect(initiateRes.body.grantToken).toBeDefined();
    expect(initiateRes.body.redirectUri).toContain(
      `sessionId=${initiateRes.body.sessionId}`,
    );
    expect(initiateRes.body.linkBaseUrl).toBeDefined();

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

  it('resolves an inbound Balance Hook to the right connection via grantId', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000201';
    const userId = '00000000-0000-4000-8000-000000000202';

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Balance Hook Test User',
      email: 'balance-hook-test@example.com',
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
      .set('Idempotency-Key', 'balance-hook-flow-initiate')
      .send({})
      .expect(201);
    const sessionId = initiateRes.body.sessionId;

    const exchangeRes = await request(app.getHttpServer())
      .post(`/api/v1/bank-connections/cas-id/sessions/${sessionId}/exchange`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'balance-hook-flow-exchange')
      .send({ publicToken: 'mock-public-token' })
      .expect(201);
    const connectionId = exchangeRes.body.connectionId;

    const connectionRow = await dataSource.query(
      'SELECT "grantId" FROM bank_connections WHERE id = $1',
      [connectionId],
    );
    const grantId: string = connectionRow[0].grantId;
    expect(grantId).toBeDefined();

    const transactionId = `balance-hook-tx-${randomUUID()}`;
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/casso-balance-hook')
      .send({
        grantId,
        transaction: {
          id: transactionId,
          amount: 5_000_000,
          transactionDateTime: '2026-08-19T10:00:00.000Z',
          description: 'test balance hook transaction',
          counterAccountNumber: '1112223334',
          counterAccountName: 'Round Trip Payer',
        },
      })
      .expect(200, { received: true, duplicate: false });

    const inboxRepo = dataSource.getRepository(WebhookInboxOrmEntity);
    const transactionRepo = dataSource.getRepository(BankTransactionOrmEntity);
    const deadline = Date.now() + 10_000;
    let inboxCount = 0;
    let transaction: BankTransactionOrmEntity | null = null;
    while (Date.now() < deadline) {
      inboxCount = await inboxRepo.countBy({ organizationId });
      transaction = await transactionRepo.findOneBy({
        providerTransactionId: transactionId,
      });
      if (inboxCount === 1 && transaction) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(inboxCount).toBe(1);
    expect(transaction).not.toBeNull();
    expect(transaction?.organizationId).toBe(organizationId);
    expect(transaction?.bankConnectionId).toBe(connectionId);
    expect(Number(transaction?.amount)).toBe(5_000_000);
  }, 15_000);
});
