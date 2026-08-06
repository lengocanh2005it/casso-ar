import { randomUUID } from 'node:crypto';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { PaymentOrmEntity } from '../src/modules/payments/infrastructure/payment.orm-entity';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';
import { BankTransactionOrmEntity } from '../src/modules/webhooks/infrastructure/bank-transaction.orm-entity';

describe('Exception Queue (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  const organizationId = '00000000-0000-4000-8000-000000000101';
  const userId = '00000000-0000-4000-8000-000000000102';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.JWT_SECRET = 'exception-queue-e2e-secret';
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.RESEND_API_KEY = 'exception-queue-e2e-resend-key';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = moduleRef.get(DataSource);

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Exception Queue User',
      email: 'exception-queue@example.com',
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

    const jwt = moduleRef.get<{ sign(payload: object): string }>('JwtService');
    token = jwt.sign({ userId, organizationId, role: Role.OWNER });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  async function createCustomer(id = randomUUID()): Promise<string> {
    await dataSource.getRepository(CustomerOrmEntity).save({
      id,
      organizationId,
      name: `Customer ${id.slice(-4)}`,
      taxCode: `TAX-${id.slice(-8)}`,
      email: `${id}@example.com`,
      phone: '0900000000',
      defaultPaymentTermDays: 30,
      creditLimit: 0,
      priority: 1,
      createdAt: new Date(),
    });
    return id;
  }

  async function createReceivable(
    customerId: string,
    originalAmount: number,
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.getRepository(ReceivableOrmEntity).save({
      id,
      organizationId,
      customerId,
      invoiceId: null,
      originalAmount,
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
      counterpartyName: 'Exception Customer',
      transferContent: 'manual review',
      status: 'PENDING_REVIEW',
      version: 1,
      createdAt: new Date(),
    });
    return id;
  }

  async function transactionVersion(id: string): Promise<number> {
    const row = await dataSource
      .getRepository(BankTransactionOrmEntity)
      .findOneByOrFail({ id });
    return Number(row.version);
  }

  it('lets exactly one of two concurrent match requests succeed', async () => {
    const customerId = await createCustomer();
    const receivableId = await createReceivable(customerId, 30_000_000);
    const transactionId = await createReviewTransaction(30_000_000);
    const body = {
      allocations: [{ receivableId, amount: 30_000_000 }],
      version: await transactionVersion(transactionId),
    };

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/bank-transactions/${transactionId}/match`)
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', `match-a-${transactionId}`)
        .send(body),
      request(app.getHttpServer())
        .post(`/api/v1/bank-transactions/${transactionId}/match`)
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', `match-b-${transactionId}`)
        .send(body),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const transaction = await dataSource
      .getRepository(BankTransactionOrmEntity)
      .findOneByOrFail({ id: transactionId });
    expect(transaction.status).toBe('MATCHED');
    expect(Number(transaction.version)).toBe(2);
    expect(
      await dataSource.getRepository(PaymentOrmEntity).countBy({
        bankTransactionId: transactionId,
      }),
    ).toBe(1);
  }, 20_000);

  it('splits one transaction across receivables and leaves the remainder unallocated', async () => {
    const customerId = await createCustomer();
    const receivableIdA = await createReceivable(customerId, 20_000_000);
    const receivableIdB = await createReceivable(customerId, 15_000_000);
    const transactionId = await createReviewTransaction(30_000_000);

    await request(app.getHttpServer())
      .post(`/api/v1/bank-transactions/${transactionId}/match`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `match-split-${transactionId}`)
      .send({
        allocations: [
          { receivableId: receivableIdA, amount: 20_000_000 },
          { receivableId: receivableIdB, amount: 5_000_000 },
        ],
        version: await transactionVersion(transactionId),
      })
      .expect(201);

    const receivableA = await dataSource
      .getRepository(ReceivableOrmEntity)
      .findOneByOrFail({ id: receivableIdA });
    const receivableB = await dataSource
      .getRepository(ReceivableOrmEntity)
      .findOneByOrFail({ id: receivableIdB });
    expect(receivableA.status).toBe(ReceivableStatus.PAID);
    expect(Number(receivableA.paidAmount)).toBe(20_000_000);
    expect(receivableB.status).toBe(ReceivableStatus.PARTIALLY_PAID);
    expect(Number(receivableB.paidAmount)).toBe(5_000_000);

    const payment = await dataSource
      .getRepository(PaymentOrmEntity)
      .findOneByOrFail({ bankTransactionId: transactionId });
    expect(Number(payment.totalAmount)).toBe(30_000_000);
    expect(Number(payment.allocatedAmount)).toBe(25_000_000);
  }, 20_000);
});
