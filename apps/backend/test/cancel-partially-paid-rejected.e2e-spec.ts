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

describe('Cancel a PARTIALLY_PAID receivable (e2e)', () => {
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

  it('rejects cancelling a receivable after it has received a payment', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000201';
    const customerId = '00000000-0000-4000-8000-000000000202';
    const userId = '00000000-0000-4000-8000-000000000203';

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Cancel Test User',
      email: 'cancel-rejected-test@example.com',
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
      name: 'Công ty C',
      taxCode: '0398765432',
      email: 'ap@congtyc.vn',
      phone: '0911111111',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      createdAt: new Date(),
    });

    const receivableRes = await request(app.getHttpServer())
      .post('/api/v1/receivables')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'cancel-rejected-create-receivable')
      .send({
        customerId,
        originalAmount: 50_000_000,
        dueDate: '2026-08-20T00:00:00.000Z',
        salesRepresentativeId: userId,
      })
      .expect(201);
    const receivableId = receivableRes.body.id;

    const paymentId = '00000000-0000-4000-8000-000000000204';
    await dataSource.getRepository(PaymentOrmEntity).save({
      id: paymentId,
      organizationId,
      customerId,
      bankTransactionId: null,
      totalAmount: 20_000_000,
      allocatedAmount: 0,
      payerName: 'Công ty C',
      receivedAt: new Date(),
      createdAt: new Date(),
    });

    await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentId}/allocate`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'cancel-rejected-allocate')
      .send({ receivableId, amount: 20_000_000 })
      .expect(201);

    const beforeCancelRow = await dataSource.query(
      'SELECT status, "paidAmount" FROM receivables WHERE id = $1',
      [receivableId],
    );
    expect(beforeCancelRow[0].status).toBe('PARTIALLY_PAID');

    const cancelRes = await request(app.getHttpServer())
      .post(`/api/v1/receivables/${receivableId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'cancel-rejected-cancel-attempt')
      .expect(400);
    expect(cancelRes.body).toMatchObject({
      statusCode: 400,
      errorCode: 'RECEIVABLE_HAS_PAYMENTS',
    });

    const afterCancelRow = await dataSource.query(
      'SELECT status, "paidAmount" FROM receivables WHERE id = $1',
      [receivableId],
    );
    expect(afterCancelRow[0].status).toBe('PARTIALLY_PAID');
    expect(Number(afterCancelRow[0].paidAmount)).toBe(20_000_000);
  });

  it('allows cancelling an OPEN receivable that has never received a payment', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000301';
    const customerId = '00000000-0000-4000-8000-000000000302';
    const userId = '00000000-0000-4000-8000-000000000303';

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Cancel OK Test User',
      email: 'cancel-ok-test@example.com',
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
      name: 'Công ty D',
      taxCode: '0387654321',
      email: 'ap@congtyd.vn',
      phone: '0922222222',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      createdAt: new Date(),
    });

    const receivableRes = await request(app.getHttpServer())
      .post('/api/v1/receivables')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'cancel-ok-create-receivable')
      .send({
        customerId,
        originalAmount: 50_000_000,
        dueDate: '2026-08-20T00:00:00.000Z',
        salesRepresentativeId: userId,
      })
      .expect(201);
    const receivableId = receivableRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/receivables/${receivableId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'cancel-ok-cancel')
      .expect(201);

    const row = await dataSource.query(
      'SELECT status FROM receivables WHERE id = $1',
      [receivableId],
    );
    expect(row[0].status).toBe('CANCELLED');
  });
});
