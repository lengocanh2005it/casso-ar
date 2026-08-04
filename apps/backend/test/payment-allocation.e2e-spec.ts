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

describe('Payment allocation (integration)', () => {
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

  it('partially allocates a payment and updates receivable status to PARTIALLY_PAID', async () => {
    const organizationId = '00000000-0000-0000-0000-000000000001';
    const customerId = '00000000-0000-0000-0000-000000000002';
    const userId = '00000000-0000-0000-0000-000000000003';

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
      .send({
        organizationId,
        customerId,
        originalAmount: 50_000_000,
        dueDate: '2026-08-20T00:00:00.000Z',
        salesRepresentativeId: userId,
      })
      .expect(201);

    const receivableId = createReceivableRes.body.id;

    const paymentId = '00000000-0000-0000-0000-000000000004';
    await dataSource.getRepository(PaymentOrmEntity).save({
      id: paymentId,
      organizationId,
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
  });
});
