import { randomUUID } from 'node:crypto';
import { ReceivableStatus } from '@casso-ledger/shared-types';
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
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { PaymentOrmEntity } from '../src/modules/payments/infrastructure/payment.orm-entity';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';
import { BankTransactionOrmEntity } from '../src/modules/webhooks/infrastructure/bank-transaction.orm-entity';

describe('Customer credit balance (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  const organizationA = '00000000-0000-4000-8000-0000000000a1';
  const organizationB = '00000000-0000-4000-8000-0000000000b1';
  const financeManagerId = '00000000-4000-8000-0000-0000000000a2';
  const salesRepId = '00000000-4000-8000-0000-0000000000a3';
  const otherOrgOwnerId = '00000000-4000-8000-0000-0000000000b2';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.JWT_SECRET = 'credit-balance-e2e-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'credit-balance-e2e-resend-key';
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'credit-balance-e2e-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'credit-balance-e2e-secret-key';

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

    const now = new Date();
    await dataSource.getRepository(UserOrmEntity).save([
      {
        id: financeManagerId,
        name: 'Finance Manager',
        email: 'finance-manager@credit-e2e.example',
        passwordHash: 'test-hash',
        emailVerifiedAt: now,
        createdAt: now,
      },
      {
        id: salesRepId,
        name: 'Sales Rep',
        email: 'sales-rep@credit-e2e.example',
        passwordHash: 'test-hash',
        emailVerifiedAt: now,
        createdAt: now,
      },
      {
        id: otherOrgOwnerId,
        name: 'Other Org Owner',
        email: 'other-owner@credit-e2e.example',
        passwordHash: 'test-hash',
        emailVerifiedAt: now,
        createdAt: now,
      },
    ]);
    await dataSource.getRepository(MembershipOrmEntity).save([
      {
        id: randomUUID(),
        organizationId: organizationA,
        userId: financeManagerId,
        role: Role.FINANCE_MANAGER,
        invitedAt: now,
        joinedAt: now,
        createdAt: now,
      },
      {
        id: randomUUID(),
        organizationId: organizationA,
        userId: salesRepId,
        role: Role.SALES_REP,
        invitedAt: now,
        joinedAt: now,
        createdAt: now,
      },
      {
        id: randomUUID(),
        organizationId: organizationB,
        userId: otherOrgOwnerId,
        role: Role.OWNER,
        invitedAt: now,
        joinedAt: now,
        createdAt: now,
      },
    ]);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  function token(userId: string, organizationId: string): string {
    return jwtService.sign({ userId, organizationId, role: Role.OWNER });
  }

  async function createCustomer(organizationId: string): Promise<string> {
    const id = randomUUID();
    await dataSource.getRepository(CustomerOrmEntity).save({
      id,
      organizationId,
      name: `Customer ${id.slice(-4)}`,
      taxCode: `TAX-${id.slice(-8)}`,
      email: `${id}@credit-e2e.example`,
      phone: '0900000000',
      defaultPaymentTermDays: 30,
      creditLimit: 0,
      priority: 1,
      createdAt: new Date(),
    });
    return id;
  }

  async function createReceivable(
    organizationId: string,
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

  async function seedPayment(
    organizationId: string,
    customerId: string,
    totalAmount: number,
    allocatedAmount = 0,
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.getRepository(PaymentOrmEntity).save({
      id,
      organizationId,
      customerId,
      bankTransactionId: null,
      totalAmount,
      allocatedAmount,
      payerName: 'Công ty Credit',
      receivedAt: new Date(),
      createdAt: new Date(),
    });
    return id;
  }

  async function createPendingReviewTransaction(
    organizationId: string,
    amount: number,
  ): Promise<string> {
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
      counterpartyName: 'Credit Customer',
      transferContent: 'manual review',
      status: 'PENDING_REVIEW',
      version: 1,
      createdAt: new Date(),
    });
    return id;
  }

  it('returns an empty balance for a customer with no unallocated payments', async () => {
    const customerId = await createCustomer(organizationA);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}/credits`)
      .set('Authorization', `Bearer ${token(financeManagerId, organizationA)}`)
      .expect(200);

    expect(res.body).toEqual({
      customerId,
      totalAvailableAmount: 0,
      items: [],
    });
  });

  it('aggregates a mark-prepaid credit with a partially allocated payment, and reduces/restores the balance through allocate/undo', async () => {
    const customerId = await createCustomer(organizationA);
    const financeToken = token(financeManagerId, organizationA);

    // mark-prepaid creates a credit Payment with allocatedAmount = 0
    const bankTransactionId = await createPendingReviewTransaction(
      organizationA,
      3_000_000,
    );
    await request(app.getHttpServer())
      .post(`/api/v1/bank-transactions/${bankTransactionId}/mark-prepaid`)
      .set('Authorization', `Bearer ${financeToken}`)
      .set('Idempotency-Key', `mark-prepaid-${randomUUID()}`)
      .send({ customerId })
      .expect(201);

    // a directly-seeded, partially-allocated payment
    const partialPaymentId = await seedPayment(
      organizationA,
      customerId,
      10_000_000,
      3_000_000, // unallocatedAmount = 7_000_000
    );

    const beforeAllocate = await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}/credits`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(200);
    expect(beforeAllocate.body.customerId).toBe(customerId);
    expect(beforeAllocate.body.totalAvailableAmount).toBe(10_000_000); // 3_000_000 + 7_000_000
    expect(beforeAllocate.body.items).toHaveLength(2);
    expect(
      beforeAllocate.body.items.every(
        (item: { unallocatedAmount: number }) => item.unallocatedAmount > 0,
      ),
    ).toBe(true);

    // apply 4_000_000 of the partial payment's credit to a fresh receivable
    const receivableId = await createReceivable(
      organizationA,
      customerId,
      4_000_000,
    );
    await request(app.getHttpServer())
      .post(`/api/v1/payments/${partialPaymentId}/allocate`)
      .set('Authorization', `Bearer ${financeToken}`)
      .set('Idempotency-Key', `allocate-${randomUUID()}`)
      .send({ receivableId, amount: 4_000_000 })
      .expect(201);

    const afterAllocate = await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}/credits`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(200);
    expect(afterAllocate.body.totalAvailableAmount).toBe(6_000_000); // 10_000_000 - 4_000_000

    const allocationRow = await dataSource.query(
      'SELECT id FROM payment_allocations WHERE "paymentId" = $1 AND "deletedAt" IS NULL',
      [partialPaymentId],
    );
    const allocationId = allocationRow[0].id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/payments/allocations/${allocationId}/undo`)
      .set('Authorization', `Bearer ${financeToken}`)
      .set('Idempotency-Key', `undo-${randomUUID()}`)
      .send({ undoReason: 'wrong receivable' })
      .expect(201);

    const afterUndo = await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}/credits`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(200);
    expect(afterUndo.body.totalAvailableAmount).toBe(10_000_000); // restored
  });

  it('excludes a fully allocated payment from the credit list', async () => {
    const customerId = await createCustomer(organizationA);
    await seedPayment(organizationA, customerId, 5_000_000, 5_000_000);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}/credits`)
      .set('Authorization', `Bearer ${token(financeManagerId, organizationA)}`)
      .expect(200);

    expect(res.body).toEqual({
      customerId,
      totalAvailableAmount: 0,
      items: [],
    });
  });

  it('allows a SALES_REP to read the credit list (RECEIVABLE_READ is universal across all 5 roles)', async () => {
    const customerId = await createCustomer(organizationA);

    await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}/credits`)
      .set('Authorization', `Bearer ${token(salesRepId, organizationA)}`)
      .expect(200);
  });

  it('returns 404 for a customer in another organization', async () => {
    const customerId = await createCustomer(organizationA);

    await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}/credits`)
      .set('Authorization', `Bearer ${token(otherOrgOwnerId, organizationB)}`)
      .expect(404);
  });

  it('rejects an over-allocation with 400, not an unhandled error', async () => {
    const customerId = await createCustomer(organizationA);
    const financeToken = token(financeManagerId, organizationA);
    const paymentId = await seedPayment(organizationA, customerId, 2_000_000);
    const receivableId = await createReceivable(
      organizationA,
      customerId,
      10_000_000,
    );

    const res = await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentId}/allocate`)
      .set('Authorization', `Bearer ${financeToken}`)
      .set('Idempotency-Key', `over-allocate-${randomUUID()}`)
      .send({ receivableId, amount: 3_000_000 }) // exceeds the payment's 2_000_000 unallocatedAmount
      .expect(400);

    expect(res.body.errorCode).toBe('ALLOCATION_EXCEEDS_UNALLOCATED');
  });

  it('rejects allocating a credit to a receivable of a different customer with 400', async () => {
    const financeToken = token(financeManagerId, organizationA);
    const creditCustomerId = await createCustomer(organizationA);
    const otherCustomerId = await createCustomer(organizationA);
    const paymentId = await seedPayment(
      organizationA,
      creditCustomerId,
      5_000_000,
    );
    const receivableId = await createReceivable(
      organizationA,
      otherCustomerId,
      5_000_000,
    );

    const res = await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentId}/allocate`)
      .set('Authorization', `Bearer ${financeToken}`)
      .set('Idempotency-Key', `cross-customer-${randomUUID()}`)
      .send({ receivableId, amount: 1_000_000 })
      .expect(400);

    expect(res.body.errorCode).toBe('CUSTOMER_MISMATCH');
  });

  it('goes to zero and drops the item once a payment becomes fully allocated', async () => {
    const financeToken = token(financeManagerId, organizationA);
    const customerId = await createCustomer(organizationA);
    const paymentId = await seedPayment(organizationA, customerId, 5_000_000);
    const receivableId = await createReceivable(
      organizationA,
      customerId,
      5_000_000,
    );

    await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentId}/allocate`)
      .set('Authorization', `Bearer ${financeToken}`)
      .set('Idempotency-Key', `full-allocate-${randomUUID()}`)
      .send({ receivableId, amount: 5_000_000 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}/credits`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(200);

    expect(res.body).toEqual({
      customerId,
      totalAvailableAmount: 0,
      items: [],
    });
  });

  it('rejects a SALES_REP (no PAYMENT_ALLOCATE) from allocating or undoing a credit', async () => {
    const salesToken = token(salesRepId, organizationA);
    const customerId = await createCustomer(organizationA);
    const paymentId = await seedPayment(organizationA, customerId, 5_000_000);
    const receivableId = await createReceivable(
      organizationA,
      customerId,
      5_000_000,
    );

    await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentId}/allocate`)
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', `sales-rep-allocate-${randomUUID()}`)
      .send({ receivableId, amount: 5_000_000 })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/v1/payments/allocations/${randomUUID()}/undo`)
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', `sales-rep-undo-${randomUUID()}`)
      .send({ undoReason: 'not allowed' })
      .expect(403);
  });

  it('lets exactly one of two concurrent allocations against the same payment succeed', async () => {
    const financeToken = token(financeManagerId, organizationA);
    const customerId = await createCustomer(organizationA);
    // Payment has just enough credit for one of the two concurrent requests.
    const paymentId = await seedPayment(organizationA, customerId, 5_000_000);
    const receivableA = await createReceivable(
      organizationA,
      customerId,
      5_000_000,
    );
    const receivableB = await createReceivable(
      organizationA,
      customerId,
      5_000_000,
    );

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/payments/${paymentId}/allocate`)
        .set('Authorization', `Bearer ${financeToken}`)
        .set('Idempotency-Key', `race-a-${randomUUID()}`)
        .send({ receivableId: receivableA, amount: 5_000_000 }),
      request(app.getHttpServer())
        .post(`/api/v1/payments/${paymentId}/allocate`)
        .set('Authorization', `Bearer ${financeToken}`)
        .set('Idempotency-Key', `race-b-${randomUUID()}`)
        .send({ receivableId: receivableB, amount: 5_000_000 }),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 400]);
    const finalCredit = await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}/credits`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(200);
    expect(finalCredit.body.totalAvailableAmount).toBe(0);
  });
});
