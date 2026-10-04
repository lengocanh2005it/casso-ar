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
import { TenantContextService } from '../src/common/tenancy/tenant-context';
import { configureApp } from '../src/configure-app';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { PaymentOrmEntity } from '../src/modules/payments/infrastructure/payment.orm-entity';
import {
  type IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../src/modules/receivables/application/receivable-repository.port';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';
import { startTestRedis } from './helpers/test-redis';

describe('Payment allocation (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let redis: StartedTestContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let tenantContext: TenantContextService;
  let receivableRepo: IReceivableRepository;

  beforeAll(async () => {
    redis = await startTestRedis();
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();

    process.env.JWT_SECRET = 'e2e-jwt-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'e2e-resend-key';
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'e2e-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'e2e-secret';

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
    tenantContext = moduleRef.get(TenantContextService);
    receivableRepo = moduleRef.get(RECEIVABLE_REPOSITORY);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await Promise.all([redis.stop(), container.stop()]);
  });

  it('partially allocates a payment and updates receivable status to PARTIALLY_PAID', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const customerId = '00000000-0000-4000-8000-000000000002';
    const userId = '00000000-0000-4000-8000-000000000003';

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Test User',
      email: 'payment-test@example.com',
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

    const createReceivableRes = await request(app.getHttpServer())
      .post('/api/v1/receivables')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'payment-allocation-create-receivable')
      .send({
        organizationId,
        customerId,
        originalAmount: 50_000_000,
        dueDate: '2026-08-20T00:00:00.000Z',
        salesRepresentativeId: userId,
      })
      .expect(201);

    const receivableId = createReceivableRes.body.id;

    const paymentId = '00000000-0000-4000-8000-000000000004';
    await dataSource.getRepository(PaymentOrmEntity).save({
      id: paymentId,
      organizationId,
      customerId,
      bankTransactionId: null,
      totalAmount: 30_000_000,
      allocatedAmount: 0,
      payerName: 'Công ty B',
      receivedAt: new Date(),
      createdAt: new Date(),
    });

    await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentId}/allocate`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'payment-allocation-allocate')
      .send({
        receivableId,
        amount: 30_000_000,
        allocatedByUserId: userId,
        organizationId,
      })
      .expect(201);

    const receivableRow = await dataSource.query(
      'SELECT status, "paidAmount" FROM receivables WHERE id = $1',
      [receivableId],
    );

    expect(receivableRow[0].status).toBe('PARTIALLY_PAID');
    expect(Number(receivableRow[0].paidAmount)).toBe(30_000_000);

    const auditRows = await dataSource.getRepository(AuditLogOrmEntity).find({
      where: { organizationId, relatedReceivableId: receivableId },
    });
    expect(auditRows.map((row) => row.actionType).sort()).toEqual([
      'PAYMENT_ALLOCATE',
      'RECEIVABLE_CREATE',
    ]);
    const allocateRow = auditRows.find(
      (row) => row.actionType === 'PAYMENT_ALLOCATE',
    );
    expect(allocateRow?.entityType).toBe('PaymentAllocation');
    expect(allocateRow?.afterState).toMatchObject({
      receivableId,
      paymentId,
      allocatedAmount: 30_000_000,
    });
  });

  it('accumulates paidAmount correctly across two allocations on a receivable reloaded from the DB (bigint money columns must stay integers)', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000011';
    const customerId = '00000000-0000-4000-8000-000000000012';
    const userId = '00000000-0000-4000-8000-000000000013';

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Bigint Test User',
      email: 'bigint-test@example.com',
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
    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'Công ty Bigint',
      taxCode: '0312345699',
      email: 'ap@bigint.vn',
      phone: '0900000001',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      createdAt: new Date(),
    });

    const token = jwtService.sign({ userId, organizationId, role: Role.OWNER });

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/receivables')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'bigint-integrity-create-receivable')
      .send({
        organizationId,
        customerId,
        originalAmount: 50_000_000,
        dueDate: '2026-08-20T00:00:00.000Z',
        salesRepresentativeId: userId,
      })
      .expect(201);
    const receivableId = createRes.body.id;

    async function createPayment(totalAmount: number): Promise<string> {
      const id = `00000000-0000-4000-8000-${Math.random()
        .toString(16)
        .slice(2, 14)}`;
      await dataSource.getRepository(PaymentOrmEntity).save({
        id,
        organizationId,
        customerId,
        bankTransactionId: null,
        totalAmount,
        allocatedAmount: 0,
        payerName: 'Công ty Bigint',
        receivedAt: new Date(),
        createdAt: new Date(),
      });
      return id;
    }

    async function allocate(
      paymentId: string,
      amount: number,
      idempotencyKey: string,
    ): Promise<void> {
      await request(app.getHttpServer())
        .post(`/api/v1/payments/${paymentId}/allocate`)
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          receivableId,
          amount,
          allocatedByUserId: userId,
          organizationId,
        })
        .expect(201);
    }

    // 1. First allocation brings paidAmount to a nonzero value.
    await allocate(
      await createPayment(20_000_000),
      20_000_000,
      'bigint-allocate-a',
    );

    // 2. Reload via the repository (not raw SQL) — this is the load path that
    //    hands pg's bigint value straight to the domain layer.
    const afterFirst = await tenantContext.run(
      { userId, organizationId, role: Role.OWNER },
      () => receivableRepo.findById(receivableId),
    );
    expect(afterFirst?.paidAmount).toBe(20_000_000);

    // 3. Second allocation on the reloaded receivable must ADD, not
    //    string-concatenate (a "20000000" string + 30000000 would produce
    //    "2000000030000000" via `+`).
    await allocate(
      await createPayment(30_000_000),
      30_000_000,
      'bigint-allocate-b',
    );

    const afterSecond = await tenantContext.run(
      { userId, organizationId, role: Role.OWNER },
      () => receivableRepo.findById(receivableId),
    );
    expect(afterSecond?.paidAmount).toBe(50_000_000);
    expect(afterSecond?.status).toBe(ReceivableStatus.PAID);

    const row = await dataSource.query(
      'SELECT status, "paidAmount" FROM receivables WHERE id = $1',
      [receivableId],
    );
    expect(row[0].status).toBe('PAID');
    expect(Number(row[0].paidAmount)).toBe(50_000_000);
  });
});
