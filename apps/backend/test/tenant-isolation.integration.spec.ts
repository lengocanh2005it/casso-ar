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

describe('Tenant isolation and RBAC (integration)', () => {
  let container: StartedPostgreSqlContainer;
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

  const receivableId = '00000000-0000-0000-0000-00000000001e';

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
    ]);

    await dataSource.getRepository(CustomerOrmEntity).save({
      id: '00000000-0000-0000-0000-0000000000c1',
      organizationId: orgA,
      name: 'Org A Customer',
      taxCode: '111',
      email: 'a@a.vn',
      phone: '0900000001',
      defaultPaymentTermDays: 30,
      creditLimit: 0,
      priority: 1,
      createdAt: new Date(),
    });

    await dataSource.getRepository(ReceivableOrmEntity).save({
      id: receivableId,
      organizationId: orgA,
      customerId: '00000000-0000-0000-0000-0000000000c1',
      invoiceId: null,
      originalAmount: 10_000_000,
      paidAmount: 0,
      dueDate: new Date('2026-09-01'),
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: '00000000-0000-0000-0000-0000000000c1',
      createdAt: new Date(),
      closedAt: null,
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

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
});
