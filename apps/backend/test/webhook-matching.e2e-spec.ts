import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { ReceivableStatus } from '@casso-ar/shared-types';
import type { INestApplication } from '@nestjs/common';
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
import { TenantContextService } from '../src/common/tenancy/tenant-context';
import { configureApp } from '../src/configure-app';
import {
  CUSTOMER_BANK_ACCOUNT_REPOSITORY,
  type ICustomerBankAccountRepository,
} from '../src/modules/bank-accounts/application/customer-bank-account-repository.port';
import { CustomerBankAccountOrmEntity } from '../src/modules/bank-accounts/infrastructure/customer-bank-account.orm-entity';
import { encryptToken } from '../src/modules/bank-connections/application/token-encryption';
import { BankConnectionOrmEntity } from '../src/modules/bank-connections/infrastructure/bank-connection.orm-entity';
import { CassoFlowAuthorizationOrmEntity } from '../src/modules/bank-connections/infrastructure/casso-flow-authorization.orm-entity';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { InvoiceStatus } from '../src/modules/invoices/domain/invoice';
import { InvoiceOrmEntity } from '../src/modules/invoices/infrastructure/invoice.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';
import { BankTransactionOrmEntity } from '../src/modules/webhooks/infrastructure/bank-transaction.orm-entity';
import { WebhookInboxOrmEntity } from '../src/modules/webhooks/infrastructure/webhook-inbox.orm-entity';
import { signCassoWebhookPayload } from './helpers/casso-webhook-signature';

describe('Webhook matching (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let redis: StartedTestContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let bankAccountRepo: ICustomerBankAccountRepository;
  let tenantContext: TenantContextService;

  const organizationId = '00000000-0000-0000-0000-0000000000f1';
  const bankConnectionId = '00000000-0000-0000-0000-0000000000f2';
  const firstTransactionId = 1_000_001;
  const matchingTransactionId = 1_000_002;
  const webhookSecret = 'e2e-test-secret';
  const payload = {
    error: 0,
    data: {
      id: firstTransactionId,
      amount: 30_000_000,
      transactionDateTime: '2026-08-05 10:00:00',
      description: 'chuyen tien',
      accountNumber: '99887766',
      counterAccountNumber: '0011002233',
      counterAccountName: 'Unknown Payer',
    },
  };

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
    process.env.JWT_SECRET = 'e2e-jwt-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'e2e-resend-key';

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
    bankAccountRepo = moduleRef.get(CUSTOMER_BANK_ACCOUNT_REPOSITORY);
    tenantContext = moduleRef.get(TenantContextService);

    const authorizationId = randomUUID();
    await dataSource.getRepository(CassoFlowAuthorizationOrmEntity).save({
      id: authorizationId,
      organizationId,
      businessId: 'e2e-business-webhook-matching',
      encryptedApiKey: encryptToken(
        'e2e-api-key',
        process.env.ACCESS_TOKEN_ENCRYPTION_KEY as string,
      ),
      encryptedSecureToken: encryptToken(
        webhookSecret,
        process.env.ACCESS_TOKEN_ENCRYPTION_KEY as string,
      ),
      createdAt: new Date(),
    });

    await dataSource.getRepository(BankConnectionOrmEntity).save({
      id: bankConnectionId,
      organizationId,
      cassoFlowAuthorizationId: authorizationId,
      accountNumber: '99887766',
      bankName: 'Test Bank',
      status: 'ACTIVE',
      connectedAt: new Date(),
      lastSyncAt: new Date(),
      revokedAt: null,
      createdAt: new Date(),
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await Promise.all([redis.stop(), container.stop()]);
  });

  it('accepts the hook and deduplicates the provider transaction', async () => {
    const endpoint = '/api/v1/webhooks/casso-balance-hook';

    await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Casso-Signature', signCassoWebhookPayload(payload, webhookSecret))
      .send(payload)
      .expect(200, { received: true, duplicate: false });

    await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Casso-Signature', signCassoWebhookPayload(payload, webhookSecret))
      .send(payload)
      .expect(200, { received: true, duplicate: true });

    const inboxRepo = dataSource.getRepository(WebhookInboxOrmEntity);
    const deadline = Date.now() + 10_000;
    let count = 0;
    while (Date.now() < deadline) {
      count = await inboxRepo.countBy({ organizationId });
      if (count === 1) break;
      await delay(100);
    }
    expect(count).toBe(1);
  });

  it('matches normalized active mappings and ignores inactive mappings', async () => {
    const customerId = '00000000-0000-0000-0000-0000000000f8';
    const bankAccountId = '00000000-0000-0000-0000-0000000000f9';
    const ormRepo = dataSource.getRepository(CustomerBankAccountOrmEntity);
    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'Company C',
      taxCode: 'TAX-2',
      email: 'company-c@example.com',
      phone: '0900000002',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      createdAt: new Date(),
    });
    await ormRepo.save({
      id: bankAccountId,
      organizationId,
      customerId,
      accountNumber: '00001122',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const lookup = () =>
      tenantContext.run(
        { userId: 'e2e-user', organizationId, role: Role.OWNER },
        () => bankAccountRepo.findByAccountNumber(' 0000 1122- '),
      );

    await expect(lookup()).resolves.toEqual(
      expect.objectContaining({ customerId }),
    );
    await ormRepo.update(bankAccountId, { isActive: false });
    await expect(lookup()).resolves.toBeNull();
  });

  it('processes a high-confidence match through the queue', async () => {
    const customerId = '00000000-0000-0000-0000-0000000000f4';
    const bankAccountId = '00000000-0000-0000-0000-0000000000f5';
    const invoiceId = '00000000-0000-0000-0000-0000000000f6';
    const receivableId = '00000000-0000-0000-0000-0000000000f7';
    const dueDate = new Date('2026-08-05T10:00:00.000Z');

    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'Company B',
      taxCode: 'TAX-1',
      email: 'company-b@example.com',
      phone: '0900000001',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      createdAt: new Date(),
    });
    await dataSource.getRepository(CustomerBankAccountOrmEntity).save({
      id: bankAccountId,
      organizationId,
      customerId,
      accountNumber: '0011002233',
      createdAt: new Date(),
    });
    await dataSource.getRepository(InvoiceOrmEntity).save({
      id: invoiceId,
      organizationId,
      customerId,
      invoiceNumber: 'INV-2026-0012',
      issueDate: new Date('2026-07-01T00:00:00.000Z'),
      totalAmount: 30_000_000,
      taxAmount: 0,
      sourceType: 'MANUAL',
      fileUrl: null,
      status: InvoiceStatus.ISSUED,
      createdAt: new Date(),
    });
    await dataSource.getRepository(ReceivableOrmEntity).save({
      id: receivableId,
      organizationId,
      customerId,
      invoiceId,
      originalAmount: 30_000_000,
      paidAmount: 0,
      dueDate,
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: null,
      createdAt: new Date(),
      closedAt: null,
      version: 1,
    });

    const matchingPayload = {
      error: 0,
      data: {
        id: matchingTransactionId,
        amount: 30_000_000,
        transactionDateTime: '2026-08-05 10:00:00',
        description: 'Thanh toan INV-2026-0012',
        accountNumber: '99887766',
        counterAccountNumber: '0011002233',
        counterAccountName: 'Company B',
      },
    };
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/casso-balance-hook')
      .set(
        'X-Casso-Signature',
        signCassoWebhookPayload(matchingPayload, webhookSecret),
      )
      .send(matchingPayload)
      .expect(200, { received: true, duplicate: false });

    const transactionRepo = dataSource.getRepository(BankTransactionOrmEntity);
    const receivableRepo = dataSource.getRepository(ReceivableOrmEntity);
    const deadline = Date.now() + 10_000;
    let transaction: BankTransactionOrmEntity | null = null;
    let receivable: ReceivableOrmEntity | null = null;
    while (Date.now() < deadline) {
      transaction = await transactionRepo.findOneBy({
        providerTransactionId: String(matchingTransactionId),
      });
      receivable = await receivableRepo.findOneBy({ id: receivableId });
      if (transaction?.status === 'MATCHED' && receivable?.status === 'PAID') {
        break;
      }
      await delay(100);
    }

    expect(transaction?.status).toBe('MATCHED');
    expect(receivable?.status).toBe('PAID');
    expect(Number(receivable?.paidAmount)).toBe(30_000_000);
  }, 15_000);

  it('supports third-party payer accounts and ambiguity guard across customers', async () => {
    const customerC1 = randomUUID();
    const customerC2 = randomUUID();
    const bankAccountC1 = randomUUID();
    const bankAccountC2 = randomUUID();
    const invoiceC1 = randomUUID();
    const invoiceC2 = randomUUID();
    const receivableC1 = randomUUID();
    const receivableC2 = randomUUID();
    const thirdPartyAccount = '0888999888';
    const dueDate = new Date('2026-08-05T10:00:00.000Z');

    // Create C1 & C2
    await dataSource.getRepository(CustomerOrmEntity).save([
      {
        id: customerC1,
        organizationId,
        name: 'Cong ty Thao Nguyen',
        taxCode: 'TAX-C1',
        email: 'c1@example.com',
        phone: '0900000011',
        defaultPaymentTermDays: 30,
        creditLimit: 100_000_000,
        priority: 1,
        createdAt: new Date(),
      },
      {
        id: customerC2,
        organizationId,
        name: 'Cong ty Hai Ha',
        taxCode: 'TAX-C2',
        email: 'c2@example.com',
        phone: '0900000012',
        defaultPaymentTermDays: 30,
        creditLimit: 100_000_000,
        priority: 1,
        createdAt: new Date(),
      },
    ]);

    // Link payer account to C1
    await dataSource.getRepository(CustomerBankAccountOrmEntity).save({
      id: bankAccountC1,
      organizationId,
      customerId: customerC1,
      accountNumber: thirdPartyAccount,
      createdAt: new Date(),
    });

    // C1 receivable for 15,000,000
    await dataSource.getRepository(InvoiceOrmEntity).save({
      id: invoiceC1,
      organizationId,
      customerId: customerC1,
      invoiceNumber: 'INV-2026-0050',
      issueDate: new Date('2026-07-01T00:00:00.000Z'),
      totalAmount: 15_000_000,
      taxAmount: 0,
      sourceType: 'MANUAL',
      fileUrl: null,
      status: InvoiceStatus.ISSUED,
      createdAt: new Date(),
    });
    await dataSource.getRepository(ReceivableOrmEntity).save({
      id: receivableC1,
      organizationId,
      customerId: customerC1,
      invoiceId: invoiceC1,
      originalAmount: 15_000_000,
      paidAmount: 0,
      dueDate,
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: null,
      createdAt: new Date(),
      closedAt: null,
      version: 1,
    });

    // Deliver webhook transaction from third-party account with un-matching name 'LE VAN THIRDPARTY' and amount 15,000,000
    const txId1 = 2_000_001;
    const thirdPartyPayload1 = {
      error: 0,
      data: {
        id: txId1,
        amount: 15_000_000,
        transactionDateTime: '2026-08-05 10:00:00',
        description: 'Thanh toan INV-2026-0050',
        accountNumber: '99887766',
        counterAccountNumber: thirdPartyAccount,
        counterAccountName: 'LE VAN THIRDPARTY',
      },
    };
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/casso-balance-hook')
      .set(
        'X-Casso-Signature',
        signCassoWebhookPayload(thirdPartyPayload1, webhookSecret),
      )
      .send(thirdPartyPayload1)
      .expect(200, { received: true, duplicate: false });

    // Wait for processing: receivableC1 matched (ref code: 50, amount: 20, bankAccount: 10, timing: 15 = 95 >= 90)
    const transactionRepo = dataSource.getRepository(BankTransactionOrmEntity);
    const receivableRepo = dataSource.getRepository(ReceivableOrmEntity);
    const deadline1 = Date.now() + 10_000;
    let tx1: BankTransactionOrmEntity | null = null;
    let rec1: ReceivableOrmEntity | null = null;
    while (Date.now() < deadline1) {
      tx1 = await transactionRepo.findOneBy({
        providerTransactionId: String(txId1),
      });
      rec1 = await receivableRepo.findOneBy({ id: receivableC1 });
      if (tx1?.status === 'MATCHED' && rec1?.status === 'PAID') {
        break;
      }
      await delay(100);
    }
    expect(tx1?.status).toBe('MATCHED');
    expect(rec1?.status).toBe('PAID');

    // Now link same payer account to C2 as well
    await dataSource.getRepository(CustomerBankAccountOrmEntity).save({
      id: bankAccountC2,
      organizationId,
      customerId: customerC2,
      accountNumber: thirdPartyAccount,
      createdAt: new Date(),
    });

    // Create open receivable on C1 (new) and C2 with same amount (20_000_000) and invoice references
    const invoiceC1_2 = randomUUID();
    const receivableC1_2 = randomUUID();
    await dataSource.getRepository(InvoiceOrmEntity).save({
      id: invoiceC1_2,
      organizationId,
      customerId: customerC1,
      invoiceNumber: 'INV-2026-0060',
      issueDate: new Date('2026-07-01T00:00:00.000Z'),
      totalAmount: 20_000_000,
      taxAmount: 0,
      sourceType: 'MANUAL',
      fileUrl: null,
      status: InvoiceStatus.ISSUED,
      createdAt: new Date(),
    });
    await dataSource.getRepository(ReceivableOrmEntity).save({
      id: receivableC1_2,
      organizationId,
      customerId: customerC1,
      invoiceId: invoiceC1_2,
      originalAmount: 20_000_000,
      paidAmount: 0,
      dueDate,
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: null,
      createdAt: new Date(),
      closedAt: null,
      version: 1,
    });

    await dataSource.getRepository(InvoiceOrmEntity).save({
      id: invoiceC2,
      organizationId,
      customerId: customerC2,
      invoiceNumber: 'INV-2026-0061',
      issueDate: new Date('2026-07-01T00:00:00.000Z'),
      totalAmount: 20_000_000,
      taxAmount: 0,
      sourceType: 'MANUAL',
      fileUrl: null,
      status: InvoiceStatus.ISSUED,
      createdAt: new Date(),
    });
    await dataSource.getRepository(ReceivableOrmEntity).save({
      id: receivableC2,
      organizationId,
      customerId: customerC2,
      invoiceId: invoiceC2,
      originalAmount: 20_000_000,
      paidAmount: 0,
      dueDate,
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: null,
      createdAt: new Date(),
      closedAt: null,
      version: 1,
    });

    // Deliver webhook transaction mentioning both invoice numbers: INV-2026-0060 va INV-2026-0061
    // Both C1 and C2 candidates will score >= 90. Ambiguity guard must route to PENDING_REVIEW.
    const txId2 = 2_000_002;
    const thirdPartyPayload2 = {
      error: 0,
      data: {
        id: txId2,
        amount: 20_000_000,
        transactionDateTime: '2026-08-05 10:00:00',
        description: 'INV-2026-0060 va INV-2026-0061',
        accountNumber: '99887766',
        counterAccountNumber: thirdPartyAccount,
        counterAccountName: 'LE VAN THIRDPARTY',
      },
    };
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/casso-balance-hook')
      .set(
        'X-Casso-Signature',
        signCassoWebhookPayload(thirdPartyPayload2, webhookSecret),
      )
      .send(thirdPartyPayload2)
      .expect(200, { received: true, duplicate: false });

    const deadline2 = Date.now() + 10_000;
    let tx2: BankTransactionOrmEntity | null = null;
    while (Date.now() < deadline2) {
      tx2 = await transactionRepo.findOneBy({
        providerTransactionId: String(txId2),
      });
      if (tx2?.status === 'PENDING_REVIEW') {
        break;
      }
      await delay(100);
    }
    expect(tx2?.status).toBe('PENDING_REVIEW');

    // Verify neither receivable was marked PAID
    const checkRec1 = await receivableRepo.findOneBy({ id: receivableC1_2 });
    const checkRec2 = await receivableRepo.findOneBy({ id: receivableC2 });
    expect(checkRec1?.status).toBe(ReceivableStatus.OPEN);
    expect(checkRec2?.status).toBe(ReceivableStatus.OPEN);
  }, 30_000);
});
