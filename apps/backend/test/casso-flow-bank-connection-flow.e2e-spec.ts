import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
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
import { encryptToken } from '../src/modules/bank-connections/application/token-encryption';
import { BankConnectionOrmEntity } from '../src/modules/bank-connections/infrastructure/bank-connection.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';
import { BankTransactionOrmEntity } from '../src/modules/webhooks/infrastructure/bank-transaction.orm-entity';
import { WebhookInboxOrmEntity } from '../src/modules/webhooks/infrastructure/webhook-inbox.orm-entity';

describe('Casso Flow bank connection flow (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.CASSO_FLOW_WEBHOOK_URL =
      'http://localhost/api/v1/webhooks/casso-balance-hook';

    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.RESEND_API_KEY = 'casso-flow-e2e-resend-key';

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
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('resolves an inbound webhook to the right connection via accountNumber + secure_token', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000301';
    const userId = '00000000-0000-4000-8000-000000000302';
    const accountNumber = '00000301';
    const webhookSecret = 'round-trip-e2e-secret';

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Casso Flow Test User',
      email: 'casso-flow-test@example.com',
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

    const connectionId = randomUUID();
    await dataSource.getRepository(BankConnectionOrmEntity).save({
      id: connectionId,
      organizationId,
      accountNumber,
      bankName: 'Round Trip Bank',
      encryptedSecureToken: encryptToken(
        webhookSecret,
        process.env.ACCESS_TOKEN_ENCRYPTION_KEY as string,
      ),
      encryptedCassoApiKey: encryptToken(
        'seeded-api-key',
        process.env.ACCESS_TOKEN_ENCRYPTION_KEY as string,
      ),
      status: 'ACTIVE',
      connectedAt: new Date(),
      lastSyncAt: null,
      revokedAt: null,
      createdAt: new Date(),
    });

    const transactionId = Math.floor(Math.random() * 1_000_000) + 1;
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/casso-balance-hook')
      .set('secure-token', webhookSecret)
      .send({
        error: 0,
        data: {
          id: transactionId,
          amount: 5_000_000,
          transactionDateTime: '2026-08-19 10:00:00',
          description: 'test balance hook transaction',
          accountNumber,
          counterAccountNumber: '1112223334',
          counterAccountName: 'Round Trip Payer',
        },
      })
      .expect(200, { received: true, duplicate: false });

    const inboxRepo = dataSource.getRepository(WebhookInboxOrmEntity);
    const transactionRepo = dataSource.getRepository(BankTransactionOrmEntity);
    const deadline = Date.now() + 10_000;
    let inboxCount = 0;
    let transaction: InstanceType<typeof BankTransactionOrmEntity> | null =
      null;
    while (Date.now() < deadline) {
      inboxCount = await inboxRepo.countBy({ organizationId });
      transaction = await transactionRepo.findOneBy({
        providerTransactionId: String(transactionId),
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
