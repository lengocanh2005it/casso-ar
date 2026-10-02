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
import { CreateCustomerBankAccountUseCase } from '../src/modules/bank-accounts/application/create-customer-bank-account.usecase';
import {
  CUSTOMER_BANK_ACCOUNT_REPOSITORY,
  type ICustomerBankAccountRepository,
} from '../src/modules/bank-accounts/application/customer-bank-account-repository.port';
import { CustomerBankAccountOrmEntity } from '../src/modules/bank-accounts/infrastructure/customer-bank-account.orm-entity';
import { encryptToken } from '../src/modules/bank-connections/application/token-encryption';
import { BankConnectionOrmEntity } from '../src/modules/bank-connections/infrastructure/bank-connection.orm-entity';
import { CassoFlowAuthorizationOrmEntity } from '../src/modules/bank-connections/infrastructure/casso-flow-authorization.orm-entity';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { MatchBankTransactionUseCase } from '../src/modules/exception-queue/application/match-bank-transaction.usecase';
import { InvoiceStatus } from '../src/modules/invoices/domain/invoice';
import { InvoiceOrmEntity } from '../src/modules/invoices/infrastructure/invoice.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { GetCustomerCreditsUseCase } from '../src/modules/payments/application/get-customer-credits.usecase';
import { PaymentOrmEntity } from '../src/modules/payments/infrastructure/payment.orm-entity';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';
import { ProcessWebhookUseCase } from '../src/modules/webhooks/application/process-webhook.usecase';
import {
  type IWebhookInboxRepository,
  WEBHOOK_INBOX_REPOSITORY,
} from '../src/modules/webhooks/application/webhook-inbox-repository.port';
import { WebhookInbox } from '../src/modules/webhooks/domain/webhook-inbox';
import { BankTransactionOrmEntity } from '../src/modules/webhooks/infrastructure/bank-transaction.orm-entity';
import { MatchingCandidateOrmEntity } from '../src/modules/webhooks/infrastructure/matching-candidate.orm-entity';
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
        () => bankAccountRepo.findActiveByAccountNumber(' 0000 1122- '),
      );

    await expect(lookup()).resolves.toEqual([
      expect.objectContaining({ customerId }),
    ]);
    await ormRepo.update(bankAccountId, { isActive: false });
    await expect(lookup()).resolves.toEqual([]);
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

  it('routes near-match overpayments to review and leaves the excess as customer credit', async () => {
    const bankAccountId = randomUUID();
    const customerId = randomUUID();
    const invoiceId = randomUUID();
    const receivableId = randomUUID();
    const underpaidInvoiceId = randomUUID();
    const underpaidReceivableId = randomUUID();
    const actorUserId = randomUUID();
    const invoiceNumber = `INV-${randomUUID().slice(0, 8)}`;
    const underpaidInvoiceNumber = `INV-${randomUUID().slice(0, 8)}`;
    const providerTransactionId = Date.now() + Math.floor(Math.random() * 1000);
    const payerAccountNumber = String(providerTransactionId).slice(-10);
    const dueDate = new Date('2026-08-05T10:00:00.000Z');
    const transferredAmount = 30_200_000;
    const underpaidAmount = 39_800_000;

    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'Near Match Customer',
      taxCode: `TAX-${randomUUID()}`,
      email: `${customerId}@example.com`,
      phone: '0900000088',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      createdAt: new Date(),
    });
    await dataSource.getRepository(CustomerBankAccountOrmEntity).save({
      id: bankAccountId,
      organizationId,
      customerId,
      accountNumber: payerAccountNumber,
      createdAt: new Date(),
    });
    await dataSource.getRepository(InvoiceOrmEntity).save({
      id: invoiceId,
      organizationId,
      customerId,
      invoiceNumber,
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

    await dataSource.getRepository(InvoiceOrmEntity).save({
      id: underpaidInvoiceId,
      organizationId,
      customerId,
      invoiceNumber: underpaidInvoiceNumber,
      issueDate: new Date('2026-07-01T00:00:00.000Z'),
      totalAmount: 40_000_000,
      taxAmount: 0,
      sourceType: 'MANUAL',
      fileUrl: null,
      status: InvoiceStatus.ISSUED,
      createdAt: new Date(),
    });
    await dataSource.getRepository(ReceivableOrmEntity).save({
      id: underpaidReceivableId,
      organizationId,
      customerId,
      invoiceId: underpaidInvoiceId,
      originalAmount: 40_000_000,
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
        id: providerTransactionId,
        amount: transferredAmount,
        transactionDateTime: '2026-08-05 10:00:00',
        description: `Thanh toan ${invoiceNumber}`,
        accountNumber: '99887766',
        counterAccountNumber: payerAccountNumber,
        counterAccountName: 'Near Match Customer',
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
    const inboxRepo = dataSource.getRepository(WebhookInboxOrmEntity);
    const deadline = Date.now() + 10_000;
    let transaction: BankTransactionOrmEntity | null = null;
    let webhookInbox: WebhookInboxOrmEntity | null = null;
    while (Date.now() < deadline) {
      transaction = await transactionRepo.findOneBy({
        providerTransactionId: String(providerTransactionId),
      });
      webhookInbox = await inboxRepo.findOneBy({
        providerTransactionId: String(providerTransactionId),
      });
      if (
        transaction?.status === 'PENDING_REVIEW' ||
        webhookInbox?.status === 'FAILED'
      ) {
        break;
      }
      await delay(100);
    }

    if (webhookInbox?.status === 'FAILED') {
      throw new Error(
        `Webhook processing failed: ${webhookInbox.errorMessage}`,
      );
    }
    expect(transaction?.status).toBe('PENDING_REVIEW');
    expect(webhookInbox?.status).toBe('PROCESSED');
    if (!transaction) throw new Error('Webhook transaction was not persisted');
    const transactionId = transaction.id;
    expect(
      await dataSource.getRepository(PaymentOrmEntity).countBy({
        bankTransactionId: transactionId,
      }),
    ).toBe(0);
    expect(
      await dataSource.getRepository(MatchingCandidateOrmEntity).countBy({
        bankTransactionId: transactionId,
      }),
    ).toBeGreaterThan(0);

    const matchUseCase = app.get(MatchBankTransactionUseCase);
    await tenantContext.run(
      { userId: actorUserId, organizationId, role: Role.OWNER },
      () =>
        matchUseCase.execute({
          bankTransactionId: transactionId,
          allocations: [{ receivableId, amount: 30_000_000 }],
          version: transaction.version,
          allocatedByUserId: actorUserId,
        }),
    );

    const payment = await dataSource
      .getRepository(PaymentOrmEntity)
      .findOneByOrFail({ bankTransactionId: transactionId });
    expect(Number(payment.totalAmount)).toBe(transferredAmount);
    expect(Number(payment.allocatedAmount)).toBe(30_000_000);
    const credits = await tenantContext.run(
      { userId: actorUserId, organizationId, role: Role.OWNER },
      () => app.get(GetCustomerCreditsUseCase).execute({ customerId }),
    );
    expect(credits.totalAvailableAmount).toBe(200_000);
    expect(credits.items[0]?.unallocatedAmount).toBe(200_000);

    const receivable = await dataSource
      .getRepository(ReceivableOrmEntity)
      .findOneByOrFail({ id: receivableId });
    expect(receivable.status).toBe(ReceivableStatus.PAID);
    expect(Number(receivable.paidAmount)).toBe(30_000_000);
    const underpaymentTransactionId = providerTransactionId + 1;
    const underpaymentPayload = {
      error: 0,
      data: {
        id: underpaymentTransactionId,
        amount: underpaidAmount,
        transactionDateTime: '2026-08-05 10:00:00',
        description: `Thanh toan ${underpaidInvoiceNumber}`,
        accountNumber: '99887766',
        counterAccountNumber: payerAccountNumber,
        counterAccountName: 'Near Match Customer',
      },
    };
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/casso-balance-hook')
      .set(
        'X-Casso-Signature',
        signCassoWebhookPayload(underpaymentPayload, webhookSecret),
      )
      .send(underpaymentPayload)
      .expect(200, { received: true, duplicate: false });

    const underpaymentDeadline = Date.now() + 10_000;
    let underpaymentTransaction: BankTransactionOrmEntity | null = null;
    let underpaymentInbox: WebhookInboxOrmEntity | null = null;
    let underpaidReceivable: ReceivableOrmEntity | null = null;
    while (Date.now() < underpaymentDeadline) {
      underpaymentTransaction = await transactionRepo.findOneBy({
        providerTransactionId: String(underpaymentTransactionId),
      });
      underpaymentInbox = await inboxRepo.findOneBy({
        providerTransactionId: String(underpaymentTransactionId),
      });
      underpaidReceivable = await dataSource
        .getRepository(ReceivableOrmEntity)
        .findOneBy({ id: underpaidReceivableId });
      if (
        underpaymentTransaction?.status === 'MATCHED' ||
        underpaymentInbox?.status === 'FAILED'
      ) {
        break;
      }
      await delay(100);
    }
    if (underpaymentInbox?.status === 'FAILED') {
      throw new Error(
        `Underpayment webhook failed: ${underpaymentInbox.errorMessage}`,
      );
    }
    expect(underpaymentTransaction?.status).toBe('MATCHED');
    expect(underpaymentInbox?.status).toBe('PROCESSED');
    expect(underpaidReceivable?.status).toBe(ReceivableStatus.PARTIALLY_PAID);
    expect(Number(underpaidReceivable?.paidAmount)).toBe(underpaidAmount);
    const underpayment = await dataSource
      .getRepository(PaymentOrmEntity)
      .findOneByOrFail({
        bankTransactionId: underpaymentTransaction?.id,
      });
    expect(Number(underpayment.totalAmount)).toBe(underpaidAmount);
    expect(Number(underpayment.allocatedAmount)).toBe(underpaidAmount);
  }, 30_000);

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

  it('remembers a payer account after a confirmed match so the next webhook prioritizes that customer', async () => {
    const customerId = randomUUID();
    const invoiceId1 = randomUUID();
    const invoiceId2 = randomUUID();
    const receivableId1 = randomUUID();
    const receivableId2 = randomUUID();
    const payerAccount = '0777888999';
    const dueDate = new Date('2026-08-05T10:00:00.000Z');
    const actingUserId = randomUUID();

    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'Cong ty Ghi Nho',
      taxCode: 'TAX-REMEMBER',
      email: 'remember@example.com',
      phone: '0900000090',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      createdAt: new Date(),
    });
    await dataSource.getRepository(InvoiceOrmEntity).save([
      {
        id: invoiceId1,
        organizationId,
        customerId,
        invoiceNumber: 'INV-2026-0080',
        issueDate: new Date('2026-07-01T00:00:00.000Z'),
        totalAmount: 12_000_000,
        taxAmount: 0,
        sourceType: 'MANUAL',
        fileUrl: null,
        status: InvoiceStatus.ISSUED,
        createdAt: new Date(),
      },
      {
        id: invoiceId2,
        organizationId,
        customerId,
        invoiceNumber: 'INV-2026-0081',
        issueDate: new Date('2026-07-01T00:00:00.000Z'),
        totalAmount: 12_000_000,
        taxAmount: 0,
        sourceType: 'MANUAL',
        fileUrl: null,
        status: InvoiceStatus.ISSUED,
        createdAt: new Date(),
      },
    ]);
    await dataSource.getRepository(ReceivableOrmEntity).save([
      {
        id: receivableId1,
        organizationId,
        customerId,
        invoiceId: invoiceId1,
        originalAmount: 12_000_000,
        paidAmount: 0,
        dueDate,
        status: ReceivableStatus.OPEN,
        salesRepresentativeId: null,
        createdAt: new Date(),
        closedAt: null,
        version: 1,
      },
      {
        id: receivableId2,
        organizationId,
        customerId,
        invoiceId: invoiceId2,
        originalAmount: 12_000_000,
        paidAmount: 0,
        dueDate,
        status: ReceivableStatus.OPEN,
        salesRepresentativeId: null,
        createdAt: new Date(),
        closedAt: null,
        version: 1,
      },
    ]);

    // 1. First webhook from an UNKNOWN payer account, referencing invoice 0080
    //    in the content -> deterministic reference-code match routes it to
    //    PENDING_REVIEW (no customer_bank_accounts link yet).
    const firstId = 3_000_001;
    const firstPayload = {
      error: 0,
      data: {
        id: firstId,
        amount: 12_000_000,
        transactionDateTime: '2026-08-05 10:00:00',
        description: 'Thanh toan INV-2026-0080',
        accountNumber: '99887766',
        counterAccountNumber: payerAccount,
        counterAccountName: 'NGUOI TRA HO',
      },
    };
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/casso-balance-hook')
      .set(
        'X-Casso-Signature',
        signCassoWebhookPayload(firstPayload, webhookSecret),
      )
      .send(firstPayload)
      .expect(200, { received: true, duplicate: false });

    const txRepo = dataSource.getRepository(BankTransactionOrmEntity);
    const deadline1 = Date.now() + 10_000;
    let firstTx: BankTransactionOrmEntity | null = null;
    while (Date.now() < deadline1) {
      firstTx = await txRepo.findOneBy({
        providerTransactionId: String(firstId),
      });
      if (firstTx?.status === 'PENDING_REVIEW') break;
      await delay(100);
    }
    expect(firstTx?.status).toBe('PENDING_REVIEW');

    const runAsUser = <T>(cb: () => Promise<T>): Promise<T> =>
      tenantContext.run(
        { userId: actingUserId, organizationId, role: Role.OWNER },
        cb,
      );

    // 2. Confirm the match against receivable 1 (the confirm-match flow).
    const matchUseCase = app.get(MatchBankTransactionUseCase);
    await runAsUser(() =>
      matchUseCase.execute({
        bankTransactionId: firstTx?.id ?? '',
        allocations: [{ receivableId: receivableId1, amount: 12_000_000 }],
        version: firstTx?.version ?? 0,
        allocatedByUserId: actingUserId,
      }),
    );
    expect(
      (await txRepo.findOneBy({ providerTransactionId: String(firstId) }))
        ?.status,
    ).toBe('MATCHED');

    const candidateRepo = dataSource.getRepository(MatchingCandidateOrmEntity);
    const topCandidate = (providerTransactionId: number) =>
      txRepo
        .findOneBy({ providerTransactionId: String(providerTransactionId) })
        .then((row) =>
          row
            ? candidateRepo.findOne({
                where: { bankTransactionId: row.id },
                order: { totalScore: 'DESC' },
              })
            : null,
        );

    // 3. RED control: a webhook that references invoice 0081 (exact code hit,
    //    score 60 + exact amount 20 + timing 5 = 85) from the SAME payer
    //    account, delivered *before* the account is remembered. It lands in
    //    PENDING_REVIEW and its top candidate scores 0 for the bank-account
    //    signal — proving the remembered link is the only thing that changes.
    const controlId = 3_000_003;
    const controlPayload = {
      error: 0,
      data: {
        id: controlId,
        amount: 12_000_000,
        transactionDateTime: '2026-08-06 09:00:00',
        description: 'Thanh toan INV-2026-0081',
        accountNumber: '99887766',
        counterAccountNumber: payerAccount,
        counterAccountName: 'NGUOI TRA HO',
      },
    };
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/casso-balance-hook')
      .set(
        'X-Casso-Signature',
        signCassoWebhookPayload(controlPayload, webhookSecret),
      )
      .send(controlPayload)
      .expect(200, { received: true, duplicate: false });

    const controlDeadline = Date.now() + 10_000;
    let controlTx: BankTransactionOrmEntity | null = null;
    while (Date.now() < controlDeadline) {
      controlTx = await txRepo.findOneBy({
        providerTransactionId: String(controlId),
      });
      if (controlTx) break;
      await delay(100);
    }
    expect(controlTx?.status).toBe('PENDING_REVIEW');
    const controlTop = await topCandidate(controlId);
    expect(controlTop?.receivableId).toBe(receivableId2);
    expect(controlTop?.customerBankAccountScore).toBe(0);
    expect(controlTop?.totalScore).toBe(85);

    // 4. Remember the payer account for this customer — the core of what the FE
    //    "Ghi nhớ tài khoản người chuyển" checkbox triggers. Driven through the
    //    use case the POST /api/v1/customers/:id/bank-accounts controller
    //    delegates to; the HTTP layer (DTO, CUSTOMER_BANK_ACCOUNT_MANAGE guard,
    //    Idempotency-Key) is covered by customer-bank-account-management.e2e-spec.
    const createLinkUseCase = app.get(CreateCustomerBankAccountUseCase);
    await runAsUser(() =>
      createLinkUseCase.execute({
        customerId,
        accountNumber: payerAccount,
        confirmedByUserId: actingUserId,
      }),
    );
    const link = await runAsUser(() =>
      bankAccountRepo.findActiveByAccountNumber(payerAccount),
    );
    expect(link).toEqual([expect.objectContaining({ customerId })]);

    // 5. GREEN: the identical webhook, now that the account is remembered. The
    //    +10 bank-account score takes the same 85 to 95 >= 90 and it
    //    auto-matches receivable 2 for this customer.
    const secondId = 3_000_002;
    const secondPayload = {
      error: 0,
      data: {
        id: secondId,
        amount: 12_000_000,
        transactionDateTime: '2026-08-06 09:00:00',
        description: 'Thanh toan INV-2026-0081',
        accountNumber: '99887766',
        counterAccountNumber: payerAccount,
        counterAccountName: 'NGUOI TRA HO',
      },
    };
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/casso-balance-hook')
      .set(
        'X-Casso-Signature',
        signCassoWebhookPayload(secondPayload, webhookSecret),
      )
      .send(secondPayload)
      .expect(200, { received: true, duplicate: false });

    const deadline2 = Date.now() + 10_000;
    let secondTx: BankTransactionOrmEntity | null = null;
    while (Date.now() < deadline2) {
      secondTx = await txRepo.findOneBy({
        providerTransactionId: String(secondId),
      });
      if (secondTx?.status === 'MATCHED') break;
      await delay(100);
    }
    expect(secondTx?.status).toBe('MATCHED');
    const paid = await dataSource
      .getRepository(ReceivableOrmEntity)
      .findOneBy({ id: receivableId2 });
    expect(paid?.status).toBe(ReceivableStatus.PAID);
    expect(Number(paid?.paidAmount)).toBe(12_000_000);
  }, 30_000);

  const saveReceivedInbox = async (
    transactionId: number,
    data: Record<string, unknown>,
  ): Promise<string> => {
    const id = randomUUID();
    await dataSource.getRepository(WebhookInboxOrmEntity).save({
      id,
      organizationId,
      bankConnectionId,
      providerTransactionId: String(transactionId),
      rawPayload: {
        error: 0,
        data: {
          id: transactionId,
          transactionDateTime: '2026-08-05 10:00:00',
          accountNumber: '99887766',
          ...data,
        },
      },
      receivedAt: new Date(),
      status: 'RECEIVED',
      processedAt: null,
      errorMessage: null,
      retryCount: 0,
    });
    return id;
  };

  const loadInbox = (id: string) =>
    dataSource.getRepository(WebhookInboxOrmEntity).findOneByOrFail({ id });

  describe('queue redelivery after the business transaction committed', () => {
    const financialTables = [
      'bank_transactions',
      'matching_candidates',
      'payments',
      'payment_allocations',
      'receivable_balance_history',
      'ledger_events',
    ] as const;

    const countFinancialRows = async (): Promise<Record<string, number>> => {
      const counts: Record<string, number> = {};
      for (const table of financialTables) {
        const [row] = await dataSource.query(
          `SELECT COUNT(*)::int AS count FROM ${table} WHERE "organizationId" = $1`,
          [organizationId],
        );
        counts[table] = row.count;
      }
      return counts;
    };

    const seedAutoMatchTarget = async (): Promise<void> => {
      const customerId = randomUUID();
      const invoiceId = randomUUID();
      await dataSource.getRepository(CustomerOrmEntity).save({
        id: customerId,
        organizationId,
        name: 'Company Replay',
        taxCode: 'TAX-422',
        email: 'company-replay@example.com',
        phone: '0900000422',
        defaultPaymentTermDays: 30,
        creditLimit: 100_000_000,
        priority: 1,
        createdAt: new Date(),
      });
      await dataSource.getRepository(CustomerBankAccountOrmEntity).save({
        id: randomUUID(),
        organizationId,
        customerId,
        accountNumber: '7700110022',
        createdAt: new Date(),
      });
      await dataSource.getRepository(InvoiceOrmEntity).save({
        id: invoiceId,
        organizationId,
        customerId,
        invoiceNumber: 'INV-2026-0422',
        issueDate: new Date('2026-07-01T00:00:00.000Z'),
        totalAmount: 20_000_000,
        taxAmount: 0,
        sourceType: 'MANUAL',
        fileUrl: null,
        status: InvoiceStatus.ISSUED,
        createdAt: new Date(),
      });
      await dataSource.getRepository(ReceivableOrmEntity).save({
        id: randomUUID(),
        organizationId,
        customerId,
        invoiceId,
        originalAmount: 20_000_000,
        paidAmount: 0,
        dueDate: new Date('2026-08-05T10:00:00.000Z'),
        status: ReceivableStatus.OPEN,
        salesRepresentativeId: null,
        createdAt: new Date(),
        closedAt: null,
        version: 1,
      });
    };

    const kinds: Array<{
      name: string;
      transactionId: number;
      data: Record<string, unknown>;
      seed?: () => Promise<void>;
    }> = [
      {
        name: 'auto-matched',
        transactionId: 1_042_201,
        data: {
          amount: 20_000_000,
          description: 'Thanh toan INV-2026-0422',
          counterAccountNumber: '7700110022',
          counterAccountName: 'Company Replay',
        },
        seed: seedAutoMatchTarget,
      },
      {
        name: 'unmatched',
        transactionId: 1_042_202,
        data: {
          amount: 1_500_000,
          description: 'khong ro noi dung',
          counterAccountNumber: '5500000001',
          counterAccountName: 'Nguoi la',
        },
      },
      {
        name: 'refund',
        transactionId: 1_042_203,
        data: {
          amount: -2_500_000,
          description: 'hoan tien',
          counterAccountNumber: '5500000002',
          counterAccountName: 'Nguoi nhan hoan',
        },
      },
    ];

    it.each(kinds)(
      'keeps the $name inbox PROCESSED and financial records unchanged on replay',
      async ({ transactionId, data, seed }) => {
        const processWebhook = app.get(ProcessWebhookUseCase, {
          strict: false,
        });
        await seed?.();
        const inboxId = await saveReceivedInbox(transactionId, data);

        await processWebhook.execute(inboxId, organizationId);
        const processed = await loadInbox(inboxId);
        const countsAfterCommit = await countFinancialRows();
        expect(processed.status).toBe('PROCESSED');
        expect(countsAfterCommit.bank_transactions).toBeGreaterThan(0);

        await expect(
          processWebhook.execute(inboxId, organizationId),
        ).resolves.toBeUndefined();

        expect(await loadInbox(inboxId)).toEqual(processed);
        expect(await countFinancialRows()).toEqual(countsAfterCommit);
      },
      30_000,
    );

    it('never overwrites PROCESSED with FAILED when a stale RECEIVED snapshot retries after commit', async () => {
      const processWebhook = app.get(ProcessWebhookUseCase, {
        strict: false,
      });
      const inboxRepo = app.get<IWebhookInboxRepository>(
        WEBHOOK_INBOX_REPOSITORY,
        { strict: false },
      );
      const inboxId = await saveReceivedInbox(1_042_204, {
        amount: 900_000,
        description: 'stale snapshot',
        counterAccountNumber: '5500000004',
        counterAccountName: 'Nguoi cu',
      });
      const staleSnapshot = new WebhookInbox({
        ...(await loadInbox(inboxId)),
      });

      await processWebhook.execute(inboxId, organizationId);
      const processed = await loadInbox(inboxId);
      const countsAfterCommit = await countFinancialRows();

      // A concurrent attempt loaded the inbox before the first one committed.
      const findById = jest
        .spyOn(inboxRepo, 'findById')
        .mockResolvedValueOnce(staleSnapshot);
      await expect(
        processWebhook.execute(inboxId, organizationId),
      ).rejects.toThrow();
      findById.mockRestore();

      expect(await loadInbox(inboxId)).toEqual(processed);
      expect(await countFinancialRows()).toEqual(countsAfterCommit);
    }, 30_000);

    it('settles two concurrent attempts on a RECEIVED inbox as PROCESSED', async () => {
      const processWebhook = app.get(ProcessWebhookUseCase, {
        strict: false,
      });
      const inboxId = await saveReceivedInbox(1_042_205, {
        amount: 700_000,
        description: 'concurrent attempts',
        counterAccountNumber: '5500000005',
        counterAccountName: 'Nguoi song song',
      });

      await Promise.allSettled([
        processWebhook.execute(inboxId, organizationId),
        processWebhook.execute(inboxId, organizationId),
      ]);

      const inbox = await loadInbox(inboxId);
      expect(inbox.status).toBe('PROCESSED');
      expect(inbox.processedAt).not.toBeNull();
      expect(inbox.errorMessage).toBeNull();
      expect(
        await dataSource
          .getRepository(BankTransactionOrmEntity)
          .countBy({ providerTransactionId: '1042205' }),
      ).toBe(1);
    }, 30_000);
  });
  describe('receivable ambiguity (#419)', () => {
    const seedCustomerWithInvoices = async (input: {
      name: string;
      payerAccount: string;
      invoices: Array<{ invoiceNumber: string; amount: number }>;
    }): Promise<{ customerId: string; receivableIds: string[] }> => {
      const customerId = randomUUID();
      await dataSource.getRepository(CustomerOrmEntity).save({
        id: customerId,
        organizationId,
        name: input.name,
        taxCode: `TAX-${input.payerAccount}`,
        email: `${input.payerAccount}@example.com`,
        phone: '0900000419',
        defaultPaymentTermDays: 30,
        creditLimit: 100_000_000,
        priority: 1,
        createdAt: new Date(),
      });
      await dataSource.getRepository(CustomerBankAccountOrmEntity).save({
        id: randomUUID(),
        organizationId,
        customerId,
        accountNumber: input.payerAccount,
        createdAt: new Date(),
      });
      const receivableIds: string[] = [];
      for (const { invoiceNumber, amount } of input.invoices) {
        const invoiceId = randomUUID();
        const receivableId = randomUUID();
        await dataSource.getRepository(InvoiceOrmEntity).save({
          id: invoiceId,
          organizationId,
          customerId,
          invoiceNumber,
          issueDate: new Date('2026-07-01T00:00:00.000Z'),
          totalAmount: amount,
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
          originalAmount: amount,
          paidAmount: 0,
          dueDate: new Date('2026-08-05T10:00:00.000Z'),
          status: ReceivableStatus.OPEN,
          salesRepresentativeId: null,
          createdAt: new Date(),
          closedAt: null,
          version: 1,
        });
        receivableIds.push(receivableId);
      }
      return { customerId, receivableIds };
    };

    it('routes a transfer that fits two receivables of the same customer to PENDING_REVIEW', async () => {
      const processWebhook = app.get(ProcessWebhookUseCase, {
        strict: false,
      });
      const { receivableIds } = await seedCustomerWithInvoices({
        name: 'Company Twin',
        payerAccount: '7700419001',
        invoices: [
          { invoiceNumber: 'INV-2026-0451', amount: 18_000_000 },
          { invoiceNumber: 'INV-2026-0452', amount: 18_000_000 },
        ],
      });
      const inboxId = await saveReceivedInbox(1_041_901, {
        amount: 18_000_000,
        description: 'Thanh toan INV-2026-0451 INV-2026-0452',
        counterAccountNumber: '7700419001',
        counterAccountName: 'Company Twin',
      });

      await processWebhook.execute(inboxId, organizationId);

      const transaction = await dataSource
        .getRepository(BankTransactionOrmEntity)
        .findOneByOrFail({ providerTransactionId: '1041901' });
      expect(transaction.status).toBe('PENDING_REVIEW');
      expect(
        await dataSource
          .getRepository(MatchingCandidateOrmEntity)
          .countBy({ bankTransactionId: transaction.id }),
      ).toBe(2);
      expect(
        await dataSource
          .getRepository(PaymentOrmEntity)
          .countBy({ bankTransactionId: transaction.id }),
      ).toBe(0);
      for (const id of receivableIds) {
        const receivable = await dataSource
          .getRepository(ReceivableOrmEntity)
          .findOneByOrFail({ id });
        expect(receivable.status).toBe(ReceivableStatus.OPEN);
        expect(Number(receivable.paidAmount)).toBe(0);
      }
      expect((await loadInbox(inboxId)).status).toBe('PROCESSED');
    }, 30_000);

    it('allocates to INV-2026-10 only when INV-2026-1 is also open for the same customer', async () => {
      const processWebhook = app.get(ProcessWebhookUseCase, {
        strict: false,
      });
      const { receivableIds } = await seedCustomerWithInvoices({
        name: 'Company Overlap',
        payerAccount: '7700419002',
        invoices: [
          { invoiceNumber: 'INV-2026-1', amount: 25_000_000 },
          { invoiceNumber: 'INV-2026-10', amount: 25_000_000 },
        ],
      });
      const [shortCodeReceivableId, longCodeReceivableId] = receivableIds;
      const inboxId = await saveReceivedInbox(1_041_902, {
        amount: 25_000_000,
        description: 'Thanh toan INV-2026-10',
        counterAccountNumber: '7700419002',
        counterAccountName: 'Company Overlap',
      });

      await processWebhook.execute(inboxId, organizationId);

      const transaction = await dataSource
        .getRepository(BankTransactionOrmEntity)
        .findOneByOrFail({ providerTransactionId: '1041902' });
      expect(transaction.status).toBe('MATCHED');
      const longCode = await dataSource
        .getRepository(ReceivableOrmEntity)
        .findOneByOrFail({ id: longCodeReceivableId });
      expect(longCode.status).toBe(ReceivableStatus.PAID);
      expect(Number(longCode.paidAmount)).toBe(25_000_000);
      const shortCode = await dataSource
        .getRepository(ReceivableOrmEntity)
        .findOneByOrFail({ id: shortCodeReceivableId });
      expect(shortCode.status).toBe(ReceivableStatus.OPEN);
      expect(Number(shortCode.paidAmount)).toBe(0);
    }, 30_000);
  });
});
