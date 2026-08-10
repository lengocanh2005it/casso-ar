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
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

describe('Overpayment allocation (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.JWT_SECRET = 'e2e-jwt-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'e2e-resend-key';
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'e2e-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'e2e-secret';

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
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('leaves payment remainder unallocated until a separate allocation call', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000101';
    const customerId = '00000000-0000-4000-8000-000000000102';
    const userId = '00000000-0000-4000-8000-000000000103';

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Overpayment Test User',
      email: 'overpayment-test@example.com',
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

    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'Công ty B',
      taxCode: '0312345678',
      email: 'ap@congtyb.vn',
      phone: '0900000000',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      createdAt: new Date(),
    });

    const receivableARes = await request(app.getHttpServer())
      .post('/api/v1/receivables')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'overpayment-create-receivable-a')
      .send({
        customerId,
        originalAmount: 50_000_000,
        dueDate: '2026-08-20T00:00:00.000Z',
        salesRepresentativeId: userId,
      })
      .expect(201);
    const receivableAId = receivableARes.body.id;

    const receivableBRes = await request(app.getHttpServer())
      .post('/api/v1/receivables')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'overpayment-create-receivable-b')
      .send({
        customerId,
        originalAmount: 100_000_000,
        dueDate: '2026-09-20T00:00:00.000Z',
        salesRepresentativeId: userId,
      })
      .expect(201);
    const receivableBId = receivableBRes.body.id;

    const paymentId = '00000000-0000-4000-8000-000000000104';
    await dataSource.getRepository(PaymentOrmEntity).save({
      id: paymentId,
      organizationId,
      customerId,
      bankTransactionId: null,
      totalAmount: 80_000_000,
      allocatedAmount: 0,
      payerName: 'Công ty B',
      receivedAt: new Date(),
      createdAt: new Date(),
    });

    await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentId}/allocate`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'overpayment-allocate-a')
      .send({ receivableId: receivableAId, amount: 50_000_000 })
      .expect(201);

    const receivableARow = await dataSource.query(
      'SELECT status, "paidAmount" FROM receivables WHERE id = $1',
      [receivableAId],
    );
    expect(receivableARow[0].status).toBe('PAID');
    expect(Number(receivableARow[0].paidAmount)).toBe(50_000_000);

    const paymentRow = await dataSource.query(
      'SELECT "totalAmount", "allocatedAmount" FROM payments WHERE id = $1',
      [paymentId],
    );
    expect(
      Number(paymentRow[0].totalAmount) - Number(paymentRow[0].allocatedAmount),
    ).toBe(30_000_000);

    const receivableBRow = await dataSource.query(
      'SELECT status, "paidAmount" FROM receivables WHERE id = $1',
      [receivableBId],
    );
    expect(receivableBRow[0].status).toBe('OPEN');
    expect(Number(receivableBRow[0].paidAmount)).toBe(0);

    const allocationRows = await dataSource.query(
      'SELECT "receivableId" FROM payment_allocations WHERE "paymentId" = $1 AND "deletedAt" IS NULL',
      [paymentId],
    );
    expect(allocationRows).toHaveLength(1);
    expect(allocationRows[0].receivableId).toBe(receivableAId);

    await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentId}/allocate`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'overpayment-allocate-b')
      .send({ receivableId: receivableBId, amount: 30_000_000 })
      .expect(201);

    const receivableBRowAfter = await dataSource.query(
      'SELECT status, "paidAmount" FROM receivables WHERE id = $1',
      [receivableBId],
    );
    expect(receivableBRowAfter[0].status).toBe('PARTIALLY_PAID');
    expect(Number(receivableBRowAfter[0].paidAmount)).toBe(30_000_000);
  });
});
