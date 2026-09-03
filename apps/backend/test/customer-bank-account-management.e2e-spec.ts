import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import request from 'supertest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AuditActionType } from '../src/common/audit/audit.enums';
import { AuditLogOrmEntity } from '../src/common/audit/audit-log.orm-entity';
import { TenantContextService } from '../src/common/tenancy/tenant-context';
import { configureApp } from '../src/configure-app';
import {
  CUSTOMER_BANK_ACCOUNT_REPOSITORY,
  type ICustomerBankAccountRepository,
} from '../src/modules/bank-accounts/application/customer-bank-account-repository.port';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

describe('Customer bank account management (e2e)', () => {
  let postgres: StartedPostgreSqlContainer;
  let redis: StartedTestContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let bankAccountRepo: ICustomerBankAccountRepository;
  let tenantContext: TenantContextService;

  const organizationA = '00000000-0000-0000-0000-0000000000a1';
  const organizationB = '00000000-0000-0000-0000-0000000000b1';
  const customerA = '00000000-0000-0000-0000-0000000000a2';
  const customerB = '00000000-0000-0000-0000-0000000000b2';
  const financeManager = '00000000-0000-0000-0000-0000000000a3';
  const salesRep = '00000000-0000-0000-0000-0000000000a4';
  const viewer = '00000000-0000-0000-0000-0000000000a5';
  const otherTenantOwner = '00000000-0000-0000-0000-0000000000b3';

  beforeAll(async () => {
    [postgres, redis] = await Promise.all([
      new PostgreSqlContainer('postgres:16').start(),
      new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
    ]);
    process.env.DB_HOST = postgres.getHost();
    process.env.DB_PORT = String(postgres.getMappedPort(5432));
    process.env.DB_USERNAME = postgres.getUsername();
    process.env.DB_PASSWORD = postgres.getPassword();
    process.env.DB_DATABASE = postgres.getDatabase();
    process.env.REDIS_HOST = redis.getHost();
    process.env.REDIS_PORT = String(redis.getMappedPort(6379));
    process.env.JWT_SECRET = 'customer-bank-account-e2e-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'customer-bank-account-e2e-resend-key';
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'customer-bank-account-e2e-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY =
      'customer-bank-account-e2e-secret-key';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideModule(TypeOrmModule)
      .useModule(
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: postgres.getHost(),
          port: postgres.getMappedPort(5432),
          username: postgres.getUsername(),
          password: postgres.getPassword(),
          database: postgres.getDatabase(),
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
    bankAccountRepo = moduleRef.get(CUSTOMER_BANK_ACCOUNT_REPOSITORY);
    tenantContext = moduleRef.get(TenantContextService);

    const now = new Date();
    await dataSource.getRepository(UserOrmEntity).save([
      {
        id: financeManager,
        name: 'Finance Manager',
        email: 'finance-manager@bank-account-e2e.example',
        passwordHash: 'test-hash',
        emailVerifiedAt: now,
        createdAt: now,
      },
      {
        id: salesRep,
        name: 'Sales Rep',
        email: 'sales-rep@bank-account-e2e.example',
        passwordHash: 'test-hash',
        emailVerifiedAt: now,
        createdAt: now,
      },
      {
        id: viewer,
        name: 'Viewer',
        email: 'viewer@bank-account-e2e.example',
        passwordHash: 'test-hash',
        emailVerifiedAt: now,
        createdAt: now,
      },
      {
        id: otherTenantOwner,
        name: 'Other Tenant Owner',
        email: 'other-owner@bank-account-e2e.example',
        passwordHash: 'test-hash',
        emailVerifiedAt: now,
        createdAt: now,
      },
    ]);
    await dataSource.getRepository(MembershipOrmEntity).save([
      {
        id: randomUUID(),
        organizationId: organizationA,
        userId: financeManager,
        role: Role.FINANCE_MANAGER,
        invitedAt: now,
        joinedAt: now,
        createdAt: now,
      },
      {
        id: randomUUID(),
        organizationId: organizationA,
        userId: salesRep,
        role: Role.SALES_REP,
        invitedAt: now,
        joinedAt: now,
        createdAt: now,
      },
      {
        id: randomUUID(),
        organizationId: organizationA,
        userId: viewer,
        role: Role.VIEWER,
        invitedAt: now,
        joinedAt: now,
        createdAt: now,
      },
      {
        id: randomUUID(),
        organizationId: organizationB,
        userId: otherTenantOwner,
        role: Role.OWNER,
        invitedAt: now,
        joinedAt: now,
        createdAt: now,
      },
    ]);
    await dataSource.getRepository(CustomerOrmEntity).save([
      {
        id: customerA,
        organizationId: organizationA,
        name: 'Customer A',
        taxCode: 'BANK-ACCOUNT-E2E-A',
        email: 'customer-a@bank-account-e2e.example',
        phone: '0900000001',
        defaultPaymentTermDays: 30,
        creditLimit: 100_000_000,
        priority: 1,
        createdAt: now,
      },
      {
        id: customerB,
        organizationId: organizationB,
        name: 'Customer B',
        taxCode: 'BANK-ACCOUNT-E2E-B',
        email: 'customer-b@bank-account-e2e.example',
        phone: '0900000002',
        defaultPaymentTermDays: 30,
        creditLimit: 100_000_000,
        priority: 1,
        createdAt: now,
      },
    ]);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await Promise.all([redis.stop(), postgres.stop()]);
  });

  function token(userId: string, organizationId: string): string {
    return jwtService.sign({
      userId,
      organizationId,
      role: Role.OWNER,
    });
  }

  function asTenant<T>(callback: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      {
        userId: financeManager,
        organizationId: organizationA,
        role: Role.FINANCE_MANAGER,
      },
      callback,
    );
  }

  async function waitForAudit(actionType: AuditActionType, entityId: string) {
    const auditRepo = dataSource.getRepository(AuditLogOrmEntity);
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const audit = await auditRepo.findOne({
        where: { organizationId: organizationA, actionType, entityId },
        order: { createdAt: 'DESC' },
      });
      if (audit) return audit;
      await delay(100);
    }
    throw new Error(`Audit log not found for ${actionType}/${entityId}`);
  }

  it('creates, lists, deactivates, reactivates, and matches a masked account', async () => {
    const financeToken = token(financeManager, organizationA);
    const endpoint = `/api/v1/customers/${customerA}/bank-accounts`;
    const created = await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${financeToken}`)
      .set('Idempotency-Key', `create-${randomUUID()}`)
      .send({ accountNumber: '0011 0022-33' })
      .expect(201);

    expect(created.body.accountNumberMasked).toBe('******2233');
    expect(created.body.accountNumber).toBeUndefined();
    const accountId = created.body.id as string;
    const createAudit = await waitForAudit(
      AuditActionType.CUSTOMER_BANK_ACCOUNT_CREATE,
      accountId,
    );
    expect(JSON.stringify(createAudit)).not.toContain('0011002233');

    await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: accountId, isActive: true }),
          ]),
        );
      });

    const deleteKey = `delete-${randomUUID()}`;
    await request(app.getHttpServer())
      .delete(`${endpoint}/${accountId}`)
      .set('Authorization', `Bearer ${financeToken}`)
      .set('Idempotency-Key', deleteKey)
      .expect(204);
    await request(app.getHttpServer())
      .delete(`${endpoint}/${accountId}`)
      .set('Authorization', `Bearer ${financeToken}`)
      .set('Idempotency-Key', deleteKey)
      .expect(204);

    await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: accountId, isActive: false }),
          ]),
        );
      });

    await request(app.getHttpServer())
      .patch(`${endpoint}/${accountId}`)
      .set('Authorization', `Bearer ${financeToken}`)
      .set('Idempotency-Key', `reactivate-${randomUUID()}`)
      .send({ isActive: true })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.objectContaining({
            id: accountId,
            accountNumberMasked: '******2233',
            isActive: true,
          }),
        );
      });

    await expect(
      asTenant(() => bankAccountRepo.findByAccountNumber('0011 0022-33')),
    ).resolves.toEqual(expect.objectContaining({ id: accountId }));
    const deactivateAudit = await waitForAudit(
      AuditActionType.CUSTOMER_BANK_ACCOUNT_DEACTIVATE,
      accountId,
    );
    expect(JSON.stringify(deactivateAudit)).not.toContain('0011002233');
  });

  it('enforces write permissions and tenant-scoped customer access', async () => {
    const endpointA = `/api/v1/customers/${customerA}/bank-accounts`;
    const endpointB = `/api/v1/customers/${customerB}/bank-accounts`;
    await request(app.getHttpServer())
      .post(endpointA)
      .set('Authorization', `Bearer ${token(salesRep, organizationA)}`)
      .set('Idempotency-Key', `sales-${randomUUID()}`)
      .send({ accountNumber: '44556677' })
      .expect(403);
    await request(app.getHttpServer())
      .post(endpointA)
      .set('Authorization', `Bearer ${token(viewer, organizationA)}`)
      .set('Idempotency-Key', `viewer-${randomUUID()}`)
      .send({ accountNumber: '44556688' })
      .expect(403);
    await request(app.getHttpServer())
      .get(endpointA)
      .set('Authorization', `Bearer ${token(otherTenantOwner, organizationB)}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(endpointB)
      .set('Authorization', `Bearer ${token(financeManager, organizationA)}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(endpointA)
      .set('Authorization', `Bearer ${token(otherTenantOwner, organizationB)}`)
      .set('Idempotency-Key', `cross-tenant-${randomUUID()}`)
      .send({ accountNumber: '99887766' })
      .expect(404);
  });

  it('rejects duplicate normalized values, including a concurrent insert race', async () => {
    const endpoint = `/api/v1/customers/${customerA}/bank-accounts`;
    const financeToken = token(financeManager, organizationA);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${financeToken}`)
      .set('Idempotency-Key', `duplicate-seed-${randomUUID()}`)
      .send({ accountNumber: '7788 9900' })
      .expect(201);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${financeToken}`)
      .set('Idempotency-Key', `duplicate-${randomUUID()}`)
      .send({ accountNumber: '77889900' })
      .expect(409);

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post(endpoint)
        .set('Authorization', `Bearer ${financeToken}`)
        .set('Idempotency-Key', `race-a-${randomUUID()}`)
        .send({ accountNumber: '1122 3344' }),
      request(app.getHttpServer())
        .post(endpoint)
        .set('Authorization', `Bearer ${financeToken}`)
        .set('Idempotency-Key', `race-b-${randomUUID()}`)
        .send({ accountNumber: '11223344' }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
  });

  it('allows the same normalized account number in a different organization', async () => {
    const accountNumber = '5566 7788';
    await request(app.getHttpServer())
      .post(`/api/v1/customers/${customerA}/bank-accounts`)
      .set('Authorization', `Bearer ${token(financeManager, organizationA)}`)
      .set('Idempotency-Key', `cross-org-a-${randomUUID()}`)
      .send({ accountNumber })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/customers/${customerB}/bank-accounts`)
      .set('Authorization', `Bearer ${token(otherTenantOwner, organizationB)}`)
      .set('Idempotency-Key', `cross-org-b-${randomUUID()}`)
      .send({ accountNumber })
      .expect(201);
  });

  it('supports cross-customer bank account linking with confirmation and prevents same-customer duplicates', async () => {
    const customerA2 = randomUUID();
    const now = new Date();
    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerA2,
      organizationId: organizationA,
      name: 'Customer A2',
      taxCode: 'BANK-ACCOUNT-E2E-A2',
      email: 'customera2@bank-account-e2e.example',
      phone: '0900000002',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      createdAt: now,
    });

    const endpointA1 = `/api/v1/customers/${customerA}/bank-accounts`;
    const endpointA2 = `/api/v1/customers/${customerA2}/bank-accounts`;
    const financeToken = token(financeManager, organizationA);
    const sharedAccountNumber = '0987 6543 21';

    // 1. Link to customer 1 -> 201
    await request(app.getHttpServer())
      .post(endpointA1)
      .set('Authorization', `Bearer ${financeToken}`)
      .set('Idempotency-Key', `cross-link-1-${randomUUID()}`)
      .send({ accountNumber: sharedAccountNumber })
      .expect(201);

    // 2. Link to customer 2 without acknowledgeExistingLinks -> 409 CONFLICT with details.linkedCustomerNames
    const conflictRes = await request(app.getHttpServer())
      .post(endpointA2)
      .set('Authorization', `Bearer ${financeToken}`)
      .set('Idempotency-Key', `cross-link-2-noack-${randomUUID()}`)
      .send({ accountNumber: sharedAccountNumber })
      .expect(409);

    expect(conflictRes.body).toEqual(
      expect.objectContaining({
        errorCode: 'CONFLICT',
        details: expect.objectContaining({
          linkedCustomerNames: expect.arrayContaining(['Customer A']),
        }),
      }),
    );

    // 3. Link to customer 2 with acknowledgeExistingLinks: true -> 201
    await request(app.getHttpServer())
      .post(endpointA2)
      .set('Authorization', `Bearer ${financeToken}`)
      .set('Idempotency-Key', `cross-link-2-ack-${randomUUID()}`)
      .send({
        accountNumber: sharedAccountNumber,
        acknowledgeExistingLinks: true,
      })
      .expect(201);

    // 4. GET for both customers shows their respective links
    const getA1 = await request(app.getHttpServer())
      .get(endpointA1)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(200);
    expect(getA1.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ customerId: customerA }),
      ]),
    );

    const getA2 = await request(app.getHttpServer())
      .get(endpointA2)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(200);
    expect(getA2.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ customerId: customerA2 }),
      ]),
    );

    // 5. Duplicate link on customer 2 with acknowledgeExistingLinks: true still fails -> 409 (same customer duplicate)
    await request(app.getHttpServer())
      .post(endpointA2)
      .set('Authorization', `Bearer ${financeToken}`)
      .set('Idempotency-Key', `cross-link-2-dup-${randomUUID()}`)
      .send({
        accountNumber: sharedAccountNumber,
        acknowledgeExistingLinks: true,
      })
      .expect(409);
  });
});
