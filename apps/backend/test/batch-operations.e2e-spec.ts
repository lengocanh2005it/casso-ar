import { randomUUID } from 'node:crypto';
import { ReceivableStatus } from '@casso-ar/shared-types';
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
import { AuditLogOrmEntity } from '../src/common/audit/audit-log.orm-entity';
import { configureApp } from '../src/configure-app';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';
import { BankTransactionOrmEntity } from '../src/modules/webhooks/infrastructure/bank-transaction.orm-entity';
import { startTestRedis } from './helpers/test-redis';

describe('Batch Operations (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let redis: StartedTestContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  const organizationId = '00000000-0000-4000-8000-000000000201';
  const userId = '00000000-0000-4000-8000-000000000202';

  beforeAll(async () => {
    redis = await startTestRedis();
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.JWT_SECRET = 'batch-operations-e2e-secret';
    process.env.RESEND_API_KEY = 'batch-operations-e2e-resend-key';

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

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Batch Ops User',
      email: 'batch-ops@example.com',
      passwordHash: 'test-hash',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      id: randomUUID(),
      organizationId,
      userId,
      role: Role.OWNER,
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });

    const jwt = moduleRef.get(JwtService);
    token = jwt.sign({ userId, organizationId, role: Role.OWNER });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await Promise.all([redis.stop(), container.stop()]);
  });

  async function createReviewTransaction(amount: number): Promise<string> {
    const id = randomUUID();
    await dataSource.getRepository(BankTransactionOrmEntity).save({
      id,
      organizationId,
      bankConnectionId: randomUUID(),
      webhookInboxId: randomUUID(),
      providerTransactionId: `TX-${id}`,
      amount,
      transactionDateTime: new Date('2026-08-01'),
      counterpartyAccountNumber: '0011002233',
      counterpartyName: 'Batch Customer',
      transferContent: 'manual review',
      status: 'PENDING_REVIEW',
      version: 1,
      createdAt: new Date(),
    });
    return id;
  }

  async function createOpenReceivable(): Promise<string> {
    const customerId = randomUUID();
    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: `Customer ${customerId.slice(-4)}`,
      taxCode: `TAX-${customerId.slice(-8)}`,
      email: `${customerId}@example.com`,
      phone: '0900000000',
      defaultPaymentTermDays: 30,
      creditLimit: 0,
      priority: 1,
      createdAt: new Date(),
    });
    const id = randomUUID();
    await dataSource.getRepository(ReceivableOrmEntity).save({
      id,
      organizationId,
      customerId,
      invoiceId: null,
      originalAmount: 10_000_000,
      paidAmount: 0,
      dueDate: new Date('2026-09-01'),
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: null,
      createdAt: new Date(),
      closedAt: null,
      version: 1,
    });
    return id;
  }

  it('skips valid transactions and reports the invalid one without blocking the rest', async () => {
    const okId = await createReviewTransaction(10_000);
    const missingId = randomUUID();

    const response = await request(app.getHttpServer())
      .post('/api/v1/bank-transactions/batch-skip')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `batch-skip-${okId}`)
      .send({ ids: [okId, missingId] })
      .expect(201);

    const results = response.body.results as Array<{
      id: string;
      status: string;
    }>;
    expect(results.find((r) => r.id === okId)?.status).toBe('success');
    expect(results.find((r) => r.id === missingId)?.status).toBe('error');

    const transaction = await dataSource
      .getRepository(BankTransactionOrmEntity)
      .findOneByOrFail({ id: okId });
    expect(transaction.status).toBe('IGNORED');

    const auditRows = await dataSource
      .getRepository(AuditLogOrmEntity)
      .countBy({ entityId: okId, organizationId });
    expect(auditRows).toBe(1);
  }, 20_000);

  it('writes off valid receivables and reports the invalid one without blocking the rest', async () => {
    const okId = await createOpenReceivable();
    const missingId = randomUUID();

    const response = await request(app.getHttpServer())
      .post('/api/v1/receivables/batch-write-off')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `batch-write-off-${okId}`)
      .send({ ids: [okId, missingId] })
      .expect(201);

    const results = response.body.results as Array<{
      id: string;
      status: string;
    }>;
    expect(results.find((r) => r.id === okId)?.status).toBe('success');
    expect(results.find((r) => r.id === missingId)?.status).toBe('error');

    const receivable = await dataSource
      .getRepository(ReceivableOrmEntity)
      .findOneByOrFail({ id: okId });
    expect(receivable.status).toBe(ReceivableStatus.WRITTEN_OFF);
  }, 20_000);
});
