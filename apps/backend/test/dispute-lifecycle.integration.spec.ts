import { randomUUID } from 'node:crypto';
import { ReceivableStatus } from '@casso-ledger/shared-types';
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
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

describe('Dispute lifecycle (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;
  const organizationId = randomUUID();
  const userId = randomUUID();
  const customerId = randomUUID();
  const receivableId = randomUUID();

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.JWT_SECRET = 'dispute-lifecycle-e2e-secret';
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.RESEND_API_KEY = 'dispute-lifecycle-e2e-resend-key';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Dispute User',
      email: `${userId}@example.com`,
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
    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'Dispute Customer',
      taxCode: `TAX-${customerId}`,
      email: `customer-${customerId}@example.com`,
      phone: '0900000000',
      defaultPaymentTermDays: 30,
      creditLimit: 0,
      priority: 1,
      createdAt: new Date(),
    });
    await dataSource.getRepository(ReceivableOrmEntity).save({
      id: receivableId,
      organizationId,
      customerId,
      invoiceId: null,
      originalAmount: 50_000_000,
      paidAmount: 0,
      dueDate: new Date('2026-09-01'),
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: null,
      createdAt: new Date(),
      closedAt: null,
      version: 1,
    });
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
    if (container) await container.stop();
  });

  it('opens, exposes computed dispute state, rejects duplicates, and resolves', async () => {
    const token = jwtService.sign({ userId, organizationId });
    const auth = { Authorization: `Bearer ${token}` };

    const openResponse = await request(app.getHttpServer())
      .post(`/api/v1/receivables/${receivableId}/disputes`)
      .set(auth)
      .set('Idempotency-Key', `open-${receivableId}`)
      .send({ reason: 'Số tiền trên hóa đơn không khớp.' })
      .expect(201);

    expect(openResponse.body.status).toBe('OPEN');
    expect(openResponse.body).not.toHaveProperty('organizationId');
    expect(openResponse.body).not.toHaveProperty('version');

    const afterOpen = await request(app.getHttpServer())
      .get(`/api/v1/receivables/${receivableId}`)
      .set(auth)
      .expect(200);

    expect(afterOpen.body.isDisputed).toBe(true);
    expect(afterOpen.body.disputeId).toBe(openResponse.body.id);
    expect(afterOpen.body.status).toBe(ReceivableStatus.OPEN);
    expect(afterOpen.body).not.toHaveProperty('organizationId');
    expect(afterOpen.body).not.toHaveProperty('version');

    const duplicate = await request(app.getHttpServer())
      .post(`/api/v1/receivables/${receivableId}/disputes`)
      .set(auth)
      .set('Idempotency-Key', `duplicate-${receivableId}`)
      .send({ reason: 'Tranh chấp thứ hai.' })
      .expect(409);
    expect(duplicate.body.errorCode).toBe('DISPUTE_ALREADY_OPEN');

    const resolveResponse = await request(app.getHttpServer())
      .post(`/api/v1/disputes/${openResponse.body.id}/resolve`)
      .set(auth)
      .set('Idempotency-Key', `resolve-${receivableId}`)
      .send()
      .expect(201);

    expect(resolveResponse.body.status).toBe('RESOLVED');
    expect(resolveResponse.body).not.toHaveProperty('organizationId');
    expect(resolveResponse.body).not.toHaveProperty('version');

    const afterResolve = await request(app.getHttpServer())
      .get(`/api/v1/receivables/${receivableId}`)
      .set(auth)
      .expect(200);

    expect(afterResolve.body.isDisputed).toBe(false);
    expect(afterResolve.body.disputeId).toBeNull();
    expect(afterResolve.body.status).toBe(ReceivableStatus.OPEN);
  }, 30_000);
});
