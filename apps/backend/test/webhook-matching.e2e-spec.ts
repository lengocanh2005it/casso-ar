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
});
