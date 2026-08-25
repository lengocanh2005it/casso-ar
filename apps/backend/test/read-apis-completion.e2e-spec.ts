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
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { InvoiceStatus } from '../src/modules/invoices/domain/invoice';
import { InvoiceOrmEntity } from '../src/modules/invoices/infrastructure/invoice.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { PaymentOrmEntity } from '../src/modules/payments/infrastructure/payment.orm-entity';
import { PaymentAllocationOrmEntity } from '../src/modules/payments/infrastructure/payment-allocation.orm-entity';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

describe('Read APIs completion (Plan #17, integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  const orgA = '00000000-0000-0000-0000-00000000000a';
  const orgB = '00000000-0000-0000-0000-00000000000b';

  const ownerA = '00000000-0000-0000-0000-0000000000a1';
  const salesRepA = '00000000-0000-0000-0000-0000000000a2';
  const otherSalesRepA = '00000000-0000-0000-0000-0000000000a3';
  const ownerB = '00000000-0000-0000-0000-0000000000b1';

  const customerA = '00000000-0000-0000-0000-0000000000c1';
  const invoiceA = '00000000-0000-0000-0000-000000000011';
  const receivableOwnedBySalesRepA = '00000000-0000-0000-0000-000000001001';
  const receivableOwnedByOtherRep = '00000000-0000-0000-0000-000000001002';
  const paymentA = '00000000-0000-0000-0000-0000000000d1';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.RESEND_API_KEY = 'read-apis-e2e-resend-key';
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
        id: ownerA,
        name: 'Org A Owner',
        email: 'owner-a@example.com',
        passwordHash: 'test-hash',
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: salesRepA,
        name: 'Org A Sales Rep',
        email: 'sales-a@example.com',
        passwordHash: 'test-hash',
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: otherSalesRepA,
        name: 'Org A Other Sales Rep',
        email: 'sales-a-2@example.com',
        passwordHash: 'test-hash',
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: ownerB,
        name: 'Org B Owner',
        email: 'owner-b@example.com',
        passwordHash: 'test-hash',
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
      },
    ]);

    await dataSource.getRepository(MembershipOrmEntity).save([
      {
        organizationId: orgA,
        userId: ownerA,
        role: Role.OWNER,
        invitedAt: new Date(),
        joinedAt: new Date(),
        createdAt: new Date(),
      },
      {
        organizationId: orgA,
        userId: salesRepA,
        role: Role.SALES_REP,
        invitedAt: new Date(),
        joinedAt: new Date(),
        createdAt: new Date(),
      },
      {
        organizationId: orgA,
        userId: otherSalesRepA,
        role: Role.SALES_REP,
        invitedAt: new Date(),
        joinedAt: new Date(),
        createdAt: new Date(),
      },
      {
        organizationId: orgB,
        userId: ownerB,
        role: Role.OWNER,
        invitedAt: new Date(),
        joinedAt: new Date(),
        createdAt: new Date(),
      },
    ]);

    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerA,
      organizationId: orgA,
      name: 'Org A Customer',
      taxCode: '111',
      email: 'customer-a@example.com',
      phone: '0900000001',
      defaultPaymentTermDays: 30,
      creditLimit: 0,
      priority: 1,
      createdAt: new Date(),
    });

    await dataSource.getRepository(InvoiceOrmEntity).save({
      id: invoiceA,
      organizationId: orgA,
      customerId: customerA,
      invoiceNumber: 'INV-0001',
      issueDate: new Date('2026-08-01'),
      totalAmount: 10_000_000,
      taxAmount: 0,
      sourceType: 'MANUAL',
      fileUrl: null,
      status: InvoiceStatus.ISSUED,
      createdAt: new Date(),
    });

    await dataSource.getRepository(ReceivableOrmEntity).save([
      {
        id: receivableOwnedBySalesRepA,
        organizationId: orgA,
        customerId: customerA,
        invoiceId: invoiceA,
        originalAmount: 10_000_000,
        paidAmount: 3_000_000,
        dueDate: new Date('2026-09-01'),
        status: ReceivableStatus.PARTIALLY_PAID,
        salesRepresentativeId: salesRepA,
        createdAt: new Date(),
        closedAt: null,
      },
      {
        id: receivableOwnedByOtherRep,
        organizationId: orgA,
        customerId: customerA,
        invoiceId: null,
        originalAmount: 5_000_000,
        paidAmount: 0,
        dueDate: new Date('2026-09-15'),
        status: ReceivableStatus.OPEN,
        salesRepresentativeId: otherSalesRepA,
        createdAt: new Date(),
        closedAt: null,
      },
    ]);

    await dataSource.getRepository(PaymentOrmEntity).save({
      id: paymentA,
      organizationId: orgA,
      customerId: customerA,
      bankTransactionId: null,
      totalAmount: 3_000_000,
      allocatedAmount: 3_000_000,
      payerName: 'Org A Customer',
      receivedAt: new Date('2026-08-05'),
      createdAt: new Date(),
    });

    await dataSource.getRepository(PaymentAllocationOrmEntity).save({
      id: '00000000-0000-0000-0000-0000000010a9',
      organizationId: orgA,
      paymentId: paymentA,
      receivableId: receivableOwnedBySalesRepA,
      allocatedAmount: 3_000_000,
      allocatedAt: new Date('2026-08-05'),
      allocatedByUserId: ownerA,
      deletedAt: null,
      deletedByUserId: null,
      undoReason: null,
      createdAt: new Date(),
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  function tokenFor(userId: string, organizationId: string, role: Role) {
    return jwtService.sign({ userId, organizationId, role });
  }

  it('GET /customers is tenant-scoped', async () => {
    const tokenOwnerB = tokenFor(ownerB, orgB, Role.OWNER);

    const res = await request(app.getHttpServer())
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${tokenOwnerB}`)
      .expect(200);

    expect(res.body).toEqual({ items: [], total: 0, page: 1, limit: 20 });
  });

  it('GET /receivables auto-scopes a SALES_REP to only their own receivables and includes invoiceNumber', async () => {
    const tokenSalesRep = tokenFor(salesRepA, orgA, Role.SALES_REP);

    const res = await request(app.getHttpServer())
      .get('/api/v1/receivables')
      .set('Authorization', `Bearer ${tokenSalesRep}`)
      .expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      id: receivableOwnedBySalesRepA,
      invoiceNumber: 'INV-0001',
      remainingAmount: 7_000_000,
      salesRepresentativeId: salesRepA,
    });
  });

  it('GET /receivables/:id returns active allocations', async () => {
    const tokenOwner = tokenFor(ownerA, orgA, Role.OWNER);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/receivables/${receivableOwnedBySalesRepA}`)
      .set('Authorization', `Bearer ${tokenOwner}`)
      .expect(200);

    expect(res.body.allocations).toContainEqual(
      expect.objectContaining({
        paymentId: paymentA,
        allocatedAmount: 3_000_000,
      }),
    );
  });

  it('GET /organizations/:id/members is forbidden across tenants', async () => {
    const tokenOwnerB = tokenFor(ownerB, orgB, Role.OWNER);

    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgA}/members`)
      .set('Authorization', `Bearer ${tokenOwnerB}`)
      .expect(403);
  });

  it('GET /organizations/:id/members returns joined email/name for the caller org', async () => {
    const tokenOwnerA = tokenFor(ownerA, orgA, Role.OWNER);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgA}/members`)
      .set('Authorization', `Bearer ${tokenOwnerA}`)
      .expect(200);

    expect(res.body.total).toBe(3);
    const owner = res.body.items.find(
      (m: { userId: string }) => m.userId === ownerA,
    );
    expect(owner).toMatchObject({
      email: 'owner-a@example.com',
      name: 'Org A Owner',
    });
  });
});
