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
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

describe('Tenant isolation and RBAC (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let redis: StartedTestContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  const orgA = '00000000-0000-0000-0000-00000000000a';
  const orgB = '00000000-0000-0000-0000-00000000000b';

  // NOTE: JwtStrategy.validate() looks up the membership row for
  // (userId, organizationId) and derives the effective role from the DB,
  // ignoring the `role` claim in the JWT payload. So each role under test
  // needs its own membership row (and therefore its own userId) — a single
  // shared "user-1" can't hold three different roles across orgA/orgB.
  const userOrgBOwner = '00000000-0000-0000-0000-0000000000b1';
  const userOrgAAccountant = '00000000-0000-0000-0000-0000000000a2';
  const userOrgAFinanceManager = '00000000-0000-0000-0000-0000000000a3';
  const userOrgASalesRepOne = '00000000-0000-0000-0000-0000000000a4';
  const userOrgASalesRepTwo = '00000000-0000-0000-0000-0000000000a5';

  const receivableId = '00000000-0000-0000-0000-00000000001e';
  const customerRepOne = '00000000-0000-0000-0000-0000000000c2';
  const customerShared = '00000000-0000-0000-0000-0000000000c3';
  const customerRepTwoOnly = '00000000-0000-0000-0000-0000000000c4';
  const customerUnassigned = '00000000-0000-0000-0000-0000000000c5';
  const customerWithoutReceivables = '00000000-0000-0000-0000-0000000000c6';
  const customerOrgB = '00000000-0000-0000-0000-0000000000c7';

  function customerRow(
    id: string,
    organizationId: string,
    name: string,
    taxCode: string,
    phone: string,
    createdAt: Date,
  ) {
    return {
      id,
      organizationId,
      name,
      taxCode,
      email: `${taxCode}@example.com`,
      phone,
      defaultPaymentTermDays: 30,
      creditLimit: 0,
      priority: 1,
      createdAt,
    };
  }

  function receivableRow(
    id: string,
    organizationId: string,
    customerId: string,
    salesRepresentativeId: string | null,
    status = ReceivableStatus.OPEN,
  ) {
    return {
      id,
      organizationId,
      customerId,
      invoiceId: null,
      originalAmount: 10_000_000,
      paidAmount: 0,
      dueDate: new Date('2026-09-01'),
      status,
      salesRepresentativeId,
      createdAt: new Date('2026-08-01'),
      closedAt: null,
    };
  }

  beforeAll(async () => {
    [container, redis] = await Promise.all([
      new PostgreSqlContainer('postgres:16').start(),
      new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
    ]);
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.REDIS_HOST = redis.getHost();
    process.env.REDIS_PORT = String(redis.getMappedPort(6379));
    process.env.RESEND_API_KEY = 'tenant-isolation-e2e-resend-key';
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

    await dataSource.getRepository(UserOrmEntity).save([
      {
        id: userOrgBOwner,
        name: 'Org B Owner',
        email: 'org-b@example.com',
        passwordHash: 'test-hash',
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: userOrgAAccountant,
        name: 'Org A Accountant',
        email: 'org-a-accountant@example.com',
        passwordHash: 'test-hash',
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: userOrgAFinanceManager,
        name: 'Org A Finance',
        email: 'org-a-finance@example.com',
        passwordHash: 'test-hash',
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: userOrgASalesRepOne,
        name: 'Org A Sales Rep One',
        email: 'org-a-sales-rep-one@example.com',
        passwordHash: 'test-hash',
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: userOrgASalesRepTwo,
        name: 'Org A Sales Rep Two',
        email: 'org-a-sales-rep-two@example.com',
        passwordHash: 'test-hash',
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
      },
    ]);

    await dataSource.getRepository(MembershipOrmEntity).save([
      {
        organizationId: orgB,
        userId: userOrgBOwner,
        role: Role.OWNER,
        invitedAt: new Date(),
        joinedAt: new Date(),
        createdAt: new Date(),
      },
      {
        organizationId: orgA,
        userId: userOrgAAccountant,
        role: Role.ACCOUNTANT,
        invitedAt: new Date(),
        joinedAt: new Date(),
        createdAt: new Date(),
      },
      {
        organizationId: orgA,
        userId: userOrgAFinanceManager,
        role: Role.FINANCE_MANAGER,
        invitedAt: new Date(),
        joinedAt: new Date(),
        createdAt: new Date(),
      },
      {
        organizationId: orgA,
        userId: userOrgASalesRepOne,
        role: Role.SALES_REP,
        invitedAt: new Date(),
        joinedAt: new Date(),
        createdAt: new Date(),
      },
      {
        organizationId: orgB,
        userId: userOrgASalesRepOne,
        role: Role.SALES_REP,
        invitedAt: new Date(),
        joinedAt: new Date(),
        createdAt: new Date(),
      },
      {
        organizationId: orgA,
        userId: userOrgASalesRepTwo,
        role: Role.SALES_REP,
        invitedAt: new Date(),
        joinedAt: new Date(),
        createdAt: new Date(),
      },
    ]);

    await dataSource
      .getRepository(CustomerOrmEntity)
      .save([
        customerRow(
          '00000000-0000-0000-0000-0000000000c1',
          orgA,
          'Org A Customer',
          '111',
          '0900000001',
          new Date('2026-09-07'),
        ),
        customerRow(
          customerRepOne,
          orgA,
          'Rep One Customer',
          '112',
          '0900000002',
          new Date('2026-09-06'),
        ),
        customerRow(
          customerShared,
          orgA,
          'Shared Customer',
          '113',
          '0900000003',
          new Date('2026-09-05'),
        ),
        customerRow(
          customerRepTwoOnly,
          orgA,
          'Rep Two Only Customer',
          '114',
          '0900000004',
          new Date('2026-09-04'),
        ),
        customerRow(
          customerUnassigned,
          orgA,
          'Unassigned Customer',
          '115',
          '0900000005',
          new Date('2026-09-03'),
        ),
        customerRow(
          customerWithoutReceivables,
          orgA,
          'Customer Without Receivables',
          '116',
          '0900000006',
          new Date('2026-09-02'),
        ),
        customerRow(
          customerOrgB,
          orgB,
          'Org B Customer',
          '117',
          '0900000007',
          new Date('2026-09-01'),
        ),
      ]);

    await dataSource
      .getRepository(ReceivableOrmEntity)
      .save([
        receivableRow(
          receivableId,
          orgA,
          '00000000-0000-0000-0000-0000000000c1',
          '00000000-0000-0000-0000-0000000000c1',
        ),
        receivableRow(
          '00000000-0000-0000-0000-000000000021',
          orgA,
          customerRepOne,
          userOrgASalesRepOne,
          ReceivableStatus.CANCELLED,
        ),
        receivableRow(
          '00000000-0000-0000-0000-000000000022',
          orgA,
          customerRepOne,
          userOrgASalesRepOne,
          ReceivableStatus.CANCELLED,
        ),
        receivableRow(
          '00000000-0000-0000-0000-000000000023',
          orgA,
          customerShared,
          userOrgASalesRepOne,
        ),
        receivableRow(
          '00000000-0000-0000-0000-000000000024',
          orgA,
          customerShared,
          userOrgASalesRepTwo,
        ),
        receivableRow(
          '00000000-0000-0000-0000-000000000025',
          orgA,
          customerRepTwoOnly,
          userOrgASalesRepTwo,
        ),
        receivableRow(
          '00000000-0000-0000-0000-000000000026',
          orgA,
          customerUnassigned,
          null,
        ),
        receivableRow(
          '00000000-0000-0000-0000-000000000027',
          orgB,
          customerOrgB,
          userOrgASalesRepOne,
        ),
      ]);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
    await redis.stop();
  }, 60_000);

  function tokenFor(
    userId: string,
    organizationId: string,
    role: Role,
  ): string {
    return jwtService.sign({ userId, organizationId, role });
  }

  it('org B cannot write-off a receivable that belongs to org A', async () => {
    const tokenOrgB = tokenFor(userOrgBOwner, orgB, Role.OWNER);

    await request(app.getHttpServer())
      .post(`/api/v1/receivables/${receivableId}/write-off`)
      .set('Authorization', `Bearer ${tokenOrgB}`)
      .set('Idempotency-Key', 'tenant-isolation-cross-org-write-off')
      .expect(404); // Receivable not found (tenant-scoped) — NotFoundException, errorCode RECEIVABLE_NOT_FOUND
  });

  it('limits SALES_REP list results, search, totals, and pagination to assigned customers', async () => {
    const token = tokenFor(userOrgASalesRepOne, orgA, Role.SALES_REP);

    const pageOne = await request(app.getHttpServer())
      .get('/api/v1/customers')
      .query({ page: 1, limit: 1 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(pageOne.body).toMatchObject({
      items: [{ id: customerRepOne }],
      total: 2,
      page: 1,
      limit: 1,
    });

    const pageTwo = await request(app.getHttpServer())
      .get('/api/v1/customers')
      .query({ page: 2, limit: 1 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(pageTwo.body).toMatchObject({
      items: [{ id: customerShared }],
      total: 2,
      page: 2,
      limit: 1,
    });

    const assignedCustomerSearch = await request(app.getHttpServer())
      .get('/api/v1/customers')
      .query({ search: 'Rep One' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(assignedCustomerSearch.body).toMatchObject({
      items: [{ id: customerRepOne }],
      total: 1,
    });
    expect(assignedCustomerSearch.body.items[0]).not.toHaveProperty(
      'receivables',
    );

    const otherRepresentativeSearch = await request(app.getHttpServer())
      .get('/api/v1/customers')
      .query({ search: 'Rep Two Only' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(otherRepresentativeSearch.body).toMatchObject({
      items: [],
      total: 0,
    });
  });

  it('limits SALES_REP customer details to customers with their assigned receivables', async () => {
    const repOneToken = tokenFor(userOrgASalesRepOne, orgA, Role.SALES_REP);
    const repTwoToken = tokenFor(userOrgASalesRepTwo, orgA, Role.SALES_REP);

    const ownCustomer = await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerRepOne}`)
      .set('Authorization', `Bearer ${repOneToken}`)
      .expect(200);
    expect(ownCustomer.body).not.toHaveProperty('receivables');
    expect(ownCustomer.body).not.toHaveProperty('remainingAmount');
    await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerShared}`)
      .set('Authorization', `Bearer ${repOneToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerShared}`)
      .set('Authorization', `Bearer ${repTwoToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerRepTwoOnly}`)
      .set('Authorization', `Bearer ${repOneToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerUnassigned}`)
      .set('Authorization', `Bearer ${repOneToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerWithoutReceivables}`)
      .set('Authorization', `Bearer ${repOneToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerRepTwoOnly}`)
      .set('Authorization', `Bearer ${repTwoToken}`)
      .expect(200);

    const repOneOrgBToken = tokenFor(userOrgASalesRepOne, orgB, Role.SALES_REP);
    await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerOrgB}`)
      .set('Authorization', `Bearer ${repOneToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerOrgB}`)
      .set('Authorization', `Bearer ${repOneOrgBToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/receivables/00000000-0000-0000-0000-000000000025')
      .set('Authorization', `Bearer ${repOneToken}`)
      .expect(404);
  });

  it('keeps non-SALES_REP customer reads organization-wide', async () => {
    const accountantToken = tokenFor(userOrgAAccountant, orgA, Role.ACCOUNTANT);
    const orgBOwnerToken = tokenFor(userOrgBOwner, orgB, Role.OWNER);

    const orgACustomers = await request(app.getHttpServer())
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${accountantToken}`)
      .expect(200);
    expect(orgACustomers.body.total).toBe(6);

    await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerUnassigned}`)
      .set('Authorization', `Bearer ${accountantToken}`)
      .expect(200);

    const orgBCustomers = await request(app.getHttpServer())
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${orgBOwnerToken}`)
      .expect(200);
    expect(orgBCustomers.body).toMatchObject({
      items: [{ id: customerOrgB }],
      total: 1,
    });
  });

  it('ACCOUNTANT role is rejected from RECEIVABLE_WRITE_OFF by PermissionGuard', async () => {
    const tokenAccountant = tokenFor(userOrgAAccountant, orgA, Role.ACCOUNTANT);

    await request(app.getHttpServer())
      .post(`/api/v1/receivables/${receivableId}/write-off`)
      .set('Authorization', `Bearer ${tokenAccountant}`)
      .set('Idempotency-Key', 'tenant-accountant-write-off')
      .expect(403);
  });

  it('FINANCE_MANAGER role in the correct org can write off the receivable', async () => {
    const tokenFinanceManager = tokenFor(
      userOrgAFinanceManager,
      orgA,
      Role.FINANCE_MANAGER,
    );

    await request(app.getHttpServer())
      .post(`/api/v1/receivables/${receivableId}/write-off`)
      .set('Authorization', `Bearer ${tokenFinanceManager}`)
      .set('Idempotency-Key', 'tenant-isolation-write-off')
      .expect(201);

    const row = await dataSource.query(
      'SELECT status FROM receivables WHERE id = $1',
      [receivableId],
    );
    expect(row[0].status).toBe('WRITTEN_OFF');
  });

  it('updates SALES_REP customer visibility when a receivable is reassigned', async () => {
    const repOneToken = tokenFor(userOrgASalesRepOne, orgA, Role.SALES_REP);
    const repTwoToken = tokenFor(userOrgASalesRepTwo, orgA, Role.SALES_REP);
    const customerId = customerRepTwoOnly;
    const assignedReceivableId = '00000000-0000-0000-0000-000000000025';

    await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${repOneToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${repTwoToken}`)
      .expect(200);

    await dataSource
      .getRepository(ReceivableOrmEntity)
      .update(
        { id: assignedReceivableId, organizationId: orgA },
        { salesRepresentativeId: userOrgASalesRepOne },
      );

    await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${repOneToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${repTwoToken}`)
      .expect(404);
  });
});
