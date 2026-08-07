import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
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
import { CustomerBankAccountOrmEntity } from '../src/modules/bank-accounts/infrastructure/customer-bank-account.orm-entity';
import { BankConnectionOrmEntity } from '../src/modules/bank-connections/infrastructure/bank-connection.orm-entity';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { InvoiceStatus } from '../src/modules/invoices/domain/invoice';
import { InvoiceOrmEntity } from '../src/modules/invoices/infrastructure/invoice.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { PaymentOrmEntity } from '../src/modules/payments/infrastructure/payment.orm-entity';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

describe('Collection Activity Timeline (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  const organizationId = randomUUID();
  const customerId = randomUUID();
  const receivableId = randomUUID();
  const paymentId = randomUUID();
  const userId = randomUUID();

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.JWT_SECRET = 'collection-activity-timeline-e2e-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'e2e-resend-key';
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'e2e-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'e2e-secret';

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
      name: 'Timeline Test User',
      email: `${userId}@example.com`,
      passwordHash: 'test-hash',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    // FINANCE_MANAGER has PAYMENT_ALLOCATE, RECEIVABLE_READ and RECEIVABLE_WRITE per ROLE_PERMISSIONS
    await dataSource.getRepository(MembershipOrmEntity).save({
      id: randomUUID(),
      organizationId,
      userId,
      role: Role.FINANCE_MANAGER,
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });

    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'Company B',
      taxCode: '0312345678',
      email: 'ap@congtyb.vn',
      phone: '0900000000',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      createdAt: new Date(),
    });

    await dataSource.getRepository(ReceivableOrmEntity).save({
      id: receivableId,
      organizationId,
      customerId,
      invoiceId: null,
      originalAmount: 30_000_000,
      paidAmount: 0,
      dueDate: new Date('2026-09-01'),
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: userId,
      createdAt: new Date(),
      closedAt: null,
    });

    await dataSource.getRepository(PaymentOrmEntity).save({
      id: paymentId,
      organizationId,
      bankTransactionId: null,
      totalAmount: 30_000_000,
      allocatedAmount: 0,
      payerName: 'Company B',
      receivedAt: new Date(),
      createdAt: new Date(),
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  function authHeader(): string {
    return `Bearer ${jwtService.sign({ userId, organizationId, role: Role.FINANCE_MANAGER })}`;
  }

  it('allocating a payment that fully closes a Receivable produces PAYMENT_RECEIVED and RECEIVABLE_CLOSED rows retrievable via both timeline endpoints', async () => {
    // 1. Allocate the full amount — receivable originalAmount === payment totalAmount, so it closes to PAID
    await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentId}/allocate`)
      .set('Authorization', authHeader())
      .set('Idempotency-Key', 'collection-activity-timeline-allocate')
      .send({ receivableId, amount: 30_000_000 })
      .expect(201);

    // 2. GET /receivables/:id/timeline shows BOTH activity rows
    const receivableTimelineRes = await request(app.getHttpServer())
      .get(`/api/v1/receivables/${receivableId}/timeline`)
      .set('Authorization', authHeader())
      .expect(200);

    const receivableActivityTypes = receivableTimelineRes.body.map(
      (a: { activityType: string }) => a.activityType,
    );
    expect(receivableActivityTypes).toEqual(
      expect.arrayContaining(['PAYMENT_RECEIVED', 'RECEIVABLE_CLOSED']),
    );
    expect(receivableTimelineRes.body).toHaveLength(2);
    for (const activity of receivableTimelineRes.body) {
      expect(activity.receivableId).toBe(receivableId);
      expect(activity.customerId).toBe(customerId);
      expect(activity.organizationId).toBeUndefined();
    }

    // 3. GET /customers/:id/timeline shows the same two rows (denormalized, no UNION needed)
    const customerTimelineRes = await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}/timeline`)
      .set('Authorization', authHeader())
      .expect(200);

    const customerActivityTypes = customerTimelineRes.body.map(
      (a: { activityType: string }) => a.activityType,
    );
    expect(customerActivityTypes).toEqual(
      expect.arrayContaining(['PAYMENT_RECEIVED', 'RECEIVABLE_CLOSED']),
    );

    // 4. Confirm the receivable itself really is PAID (sanity check on the source of truth)
    const receivableRow = await dataSource.query(
      'SELECT status FROM receivables WHERE id = $1',
      [receivableId],
    );
    expect(receivableRow[0].status).toBe('PAID');
  });

  it('records a manual MANUAL_CALL activity via POST /receivables/:id/activities', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/receivables/${receivableId}/activities`)
      .set('Authorization', authHeader())
      .set('Idempotency-Key', 'collection-activity-timeline-manual-call')
      .send({
        activityType: 'MANUAL_CALL',
        description: 'Called to confirm full payment was received',
      })
      .expect(201);

    expect(res.body.activityType).toBe('MANUAL_CALL');
    expect(res.body.createdByUserId).toBe(userId);
    expect(res.body.organizationId).toBeUndefined();

    const timelineRes = await request(app.getHttpServer())
      .get(`/api/v1/receivables/${receivableId}/timeline`)
      .set('Authorization', authHeader())
      .expect(200);

    expect(timelineRes.body).toHaveLength(3);
  });

  describe('webhook auto-match path', () => {
    // Fixture/scoring pattern reused from apps/backend/test/webhook-matching.e2e-spec.ts
    // ("processes a high-confidence match through the queue"): a bank transaction whose
    // counterpartyName matches the customer name and transferContent contains the invoice
    // number scores >= 90 and auto-matches without going through the exception queue.
    const webhookOrganizationId = randomUUID();
    const webhookBankConnectionId = randomUUID();
    const webhookCustomerId = randomUUID();
    const webhookBankAccountId = randomUUID();
    const webhookInvoiceId = randomUUID();
    const webhookReceivableId = randomUUID();
    const webhookTransactionId = `provider-tx-${randomUUID()}`;

    beforeAll(async () => {
      await dataSource.getRepository(BankConnectionOrmEntity).save({
        id: webhookBankConnectionId,
        organizationId: webhookOrganizationId,
        casIdConnectionSessionId: randomUUID(),
        encryptedAccessToken: 'encrypted-test-token',
        accountIdentity: { accountNumber: '99887766', bankName: 'Test Bank' },
        status: 'ACTIVE',
        scopes: ['balances'],
        connectedAt: new Date(),
        lastSyncAt: new Date(),
        revokedAt: null,
        createdAt: new Date(),
      });
      await dataSource.getRepository(CustomerOrmEntity).save({
        id: webhookCustomerId,
        organizationId: webhookOrganizationId,
        name: 'Company Webhook',
        taxCode: 'TAX-WEBHOOK',
        email: 'ap@companywebhook.vn',
        phone: '0900000002',
        defaultPaymentTermDays: 30,
        creditLimit: 100_000_000,
        priority: 1,
        createdAt: new Date(),
      });
      await dataSource.getRepository(CustomerBankAccountOrmEntity).save({
        id: randomUUID(),
        organizationId: webhookOrganizationId,
        customerId: webhookCustomerId,
        accountNumber: '0011002244',
        createdAt: new Date(),
      });
      await dataSource.getRepository(InvoiceOrmEntity).save({
        id: webhookInvoiceId,
        organizationId: webhookOrganizationId,
        customerId: webhookCustomerId,
        invoiceNumber: 'INV-2026-0099',
        issueDate: new Date('2026-07-01T00:00:00.000Z'),
        totalAmount: 15_000_000,
        taxAmount: 0,
        sourceType: 'MANUAL',
        fileUrl: null,
        status: InvoiceStatus.ISSUED,
        createdAt: new Date(),
      });
      await dataSource.getRepository(ReceivableOrmEntity).save({
        id: webhookReceivableId,
        organizationId: webhookOrganizationId,
        customerId: webhookCustomerId,
        invoiceId: webhookInvoiceId,
        originalAmount: 15_000_000,
        paidAmount: 0,
        dueDate: new Date('2026-08-05T10:00:00.000Z'),
        status: ReceivableStatus.OPEN,
        salesRepresentativeId: null,
        createdAt: new Date(),
        closedAt: null,
        version: 1,
      });
    });

    it('auto-matching a bank transaction that fully closes a Receivable produces PAYMENT_RECEIVED and RECEIVABLE_CLOSED rows in the timeline', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/webhooks/casso-balance-hook')
        .set({ 'x-client-id': 'e2e-client', 'x-secret-key': 'e2e-secret' })
        .send({
          organizationId: webhookOrganizationId,
          bankConnectionId: webhookBankConnectionId,
          transactionId: webhookTransactionId,
          amount: 15_000_000,
          transactionDateTime: '2026-08-05T10:00:00.000Z',
          counterpartyAccountNumber: '0011002244',
          counterpartyName: 'Company Webhook',
          transferContent: 'Thanh toan INV-2026-0099',
        })
        .expect(200, { received: true, duplicate: false });

      const webhookToken = jwtService.sign({
        userId,
        organizationId: webhookOrganizationId,
        role: Role.FINANCE_MANAGER,
      });
      await dataSource.getRepository(MembershipOrmEntity).save({
        id: randomUUID(),
        organizationId: webhookOrganizationId,
        userId,
        role: Role.FINANCE_MANAGER,
        invitedAt: new Date(),
        joinedAt: new Date(),
        createdAt: new Date(),
      });

      // Poll the timeline endpoint itself (the actual artifact under test)
      // rather than transaction/receivable status: CollectionActivity rows
      // are inserted by the listener AFTER process-webhook.usecase.ts's
      // dataSource.transaction(...) commits, as a separate emitAllocationEvents
      // step, so those statuses flip before the rows this test asserts on exist.
      const deadline = Date.now() + 10_000;
      let activityTypes: string[] = [];
      let receivableTimelineRes: request.Response | undefined;
      while (Date.now() < deadline) {
        receivableTimelineRes = await request(app.getHttpServer())
          .get(`/api/v1/receivables/${webhookReceivableId}/timeline`)
          .set('Authorization', `Bearer ${webhookToken}`)
          .expect(200);
        activityTypes = receivableTimelineRes.body.map(
          (a: { activityType: string }) => a.activityType,
        );
        if (
          activityTypes.includes('PAYMENT_RECEIVED') &&
          activityTypes.includes('RECEIVABLE_CLOSED')
        ) {
          break;
        }
        await delay(100);
      }

      expect(activityTypes).toEqual(
        expect.arrayContaining(['PAYMENT_RECEIVED', 'RECEIVABLE_CLOSED']),
      );
    }, 15_000);
  });
});
