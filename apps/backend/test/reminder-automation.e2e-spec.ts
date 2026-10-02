import { randomUUID } from 'node:crypto';
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
import { TenantContextService } from '../src/common/tenancy/tenant-context';
import { REMINDER_EXECUTION_REPOSITORY } from '../src/common/tokens/reminder-execution.token';
import { configureApp } from '../src/configure-app';
import { CustomerGroup } from '../src/modules/customers/domain/customer-group';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { DisputeStatus } from '../src/modules/disputes/domain/dispute';
import { DisputeOrmEntity } from '../src/modules/disputes/infrastructure/dispute.orm-entity';
import { EmailTemplateOrmEntity } from '../src/modules/email-templates/infrastructure/email-template.orm-entity';
import { EMAIL_PROVIDER_ADAPTER } from '../src/modules/notifications/application/email-provider-adapter.port';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { OrganizationOrmEntity } from '../src/modules/organizations/infrastructure/organization.orm-entity';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';
import type { IReminderExecutionRepository } from '../src/modules/reminders/application/reminder-execution-repository.port';
import type { IReminderPolicyRepository } from '../src/modules/reminders/application/reminder-policy-repository.port';
import type { IReminderRuleRepository } from '../src/modules/reminders/application/reminder-rule-repository.port';
import { ReminderSchedulerService } from '../src/modules/reminders/application/reminder-scheduler.service';
import { ReminderSenderService } from '../src/modules/reminders/application/reminder-sender.service';
import {
  ReminderExecutionStatus,
  ReminderSkipReason,
} from '../src/modules/reminders/domain/reminder-execution';
import { ReminderExecutionOrmEntity } from '../src/modules/reminders/infrastructure/reminder-execution.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

const fakeEmailProvider = {
  send: jest.fn().mockResolvedValue({ providerMessageId: 'fake-msg-id' }),
};

async function waitUntil(
  check: () => Promise<boolean>,
  timeoutMs = 10_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`waitUntil timed out after ${timeoutMs}ms`);
}

describe('Reminder automation (integration)', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let redis: StartedTestContainer | undefined;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  beforeAll(async () => {
    // Own Redis: the .env Redis is shared with any running dev backend, whose
    // BullMQ workers would steal this test's queue jobs.
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
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'e2e-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'e2e-secret';
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
      .overrideProvider(EMAIL_PROVIDER_ADAPTER)
      .useValue(fakeEmailProvider)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await Promise.all([redis?.stop(), container?.stop()]);
  });

  beforeEach(() => {
    fakeEmailProvider.send.mockClear();
  });

  async function setUpOrg(organizationId: string) {
    const userId = '00000000-0000-4000-8000-000000000100';
    const customerId = '00000000-0000-4000-8000-000000000101';
    const now = new Date();

    await dataSource.getRepository(OrganizationOrmEntity).save({
      id: organizationId,
      name: `Reminder Test ${organizationId.slice(-4)}`,
      createdAt: now,
    });

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Test User',
      email: `reminder-test-${organizationId.slice(-4)}@example.com`,
      passwordHash: 'test-hash',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });

    await dataSource.getRepository(MembershipOrmEntity).save({
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
      name: 'Công ty C',
      taxCode: '0398765432',
      email: 'ap@congtyc.vn',
      phone: '0911111111',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      customerGroup: CustomerGroup.VIP,
      createdAt: new Date(),
    });

    const token = jwtService.sign({ userId, organizationId, role: Role.OWNER });
    return { customerId, token };
  }

  it('GET /reminder-executions returns paginated results', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000400';
    const { token } = await setUpOrg(organizationId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/reminder-executions')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, limit: 10 })
      .expect(200);

    expect(res.body).toHaveProperty('items');
    expect(res.body).toHaveProperty('total');
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('GET /reminder-policies lists policies for the organization', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000500';
    const { token } = await setUpOrg(organizationId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/reminder-policies')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /reminder-policies creates a policy with rules', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000600';
    const { token } = await setUpOrg(organizationId);

    const res = await request(app.getHttpServer())
      .post('/api/v1/reminder-policies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerGroup: 'VIP',
        isActive: true,
        rules: [
          {
            offsetDays: -3,
            emailTemplateId: 'fake-template',
            minIntervalDays: 7,
          },
        ],
      })
      .expect(201);

    expect(res.body.customerGroup).toBe('VIP');
  });

  it('scheduler scans and does not throw for empty data', async () => {
    const scheduler = app.get(ReminderSchedulerService);
    await scheduler.scan(new Date('2026-08-03'));
  });

  async function createReceivable(
    organizationId: string,
    customerId: string,
    overrides: Partial<{ status: ReceivableStatus; dueDate: Date }> = {},
  ): Promise<string> {
    const receivable = await dataSource
      .getRepository(ReceivableOrmEntity)
      .save({
        id: randomUUID(),
        organizationId,
        customerId,
        invoiceId: null,
        originalAmount: 50_000_000,
        paidAmount: 0,
        dueDate: overrides.dueDate ?? new Date('2026-08-08'),
        status: overrides.status ?? ReceivableStatus.OPEN,
        salesRepresentativeId: null,
        createdAt: new Date(),
        closedAt: null,
      });
    return receivable.id;
  }

  async function createPolicyWithRule(
    token: string,
    offsetDays: number,
    minIntervalDays: number,
    emailTemplateId = 'tpl-1',
  ): Promise<void> {
    await request(app.getHttpServer())
      .post('/api/v1/reminder-policies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerGroup: 'VIP',
        isActive: true,
        rules: [{ offsetDays, emailTemplateId, minIntervalDays }],
      })
      .expect(201);
  }

  async function createEmailTemplate(organizationId: string): Promise<string> {
    const template = await dataSource
      .getRepository(EmailTemplateOrmEntity)
      .save({
        id: randomUUID(),
        organizationId,
        name: 'Test reminder template',
        subject: 'Reminder',
        bodyHtml: '<p>Reminder</p>',
        reminderStage: null,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      });
    return template.id;
  }

  async function getRuleId(organizationId: string): Promise<string> {
    const tenantContext = app.get(TenantContextService);
    return tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      async () => {
        const policyRepo = app.get<IReminderPolicyRepository>(
          'IReminderPolicyRepository',
        );
        const ruleRepo = app.get<IReminderRuleRepository>(
          'IReminderRuleRepository',
        );
        const policy = await policyRepo.findByCustomerGroup(CustomerGroup.VIP);
        if (!policy) throw new Error('VIP policy not found in test setup');
        const rules = await ruleRepo.findByPolicyId(policy.id);
        return rules[0].id;
      },
    );
  }

  it('scan() skips a receivable with an open dispute even at the exact offset', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000700';
    const openedByUserId = '00000000-0000-4000-8000-000000000100';
    const { customerId, token } = await setUpOrg(organizationId);
    await createPolicyWithRule(token, -5, 7);
    const receivableId = await createReceivable(organizationId, customerId, {
      dueDate: new Date('2026-08-08'),
    });
    await dataSource.getRepository(DisputeOrmEntity).save({
      id: randomUUID(),
      organizationId,
      receivableId,
      reason: 'late payment',
      status: DisputeStatus.OPEN,
      openedByUserId,
      resolvedByUserId: null,
      resolvedAt: null,
      createdAt: new Date(),
    });

    const scheduler = app.get(ReminderSchedulerService);
    await scheduler.scan(new Date('2026-08-03'));

    const executionRepo = app.get<IReminderExecutionRepository>(
      REMINDER_EXECUTION_REPOSITORY,
    );
    const tenantContext = app.get(TenantContextService);
    const executions = await tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      () => executionRepo.findPage({ receivableId, page: 1, limit: 10 }),
    );
    expect(executions.items).toHaveLength(0);
  });

  it('scan() records SKIPPED/RATE_LIMITED when a recent SENT execution is within minIntervalDays', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000800';
    const { customerId, token } = await setUpOrg(organizationId);
    await createPolicyWithRule(token, -5, 7);
    const receivableId = await createReceivable(organizationId, customerId, {
      dueDate: new Date('2026-08-08'),
    });
    const ruleId = await getRuleId(organizationId);

    await dataSource.getRepository(ReminderExecutionOrmEntity).save({
      id: randomUUID(),
      organizationId,
      receivableId,
      reminderRuleId: ruleId,
      executionDate: new Date('2026-08-01'),
      sentAt: new Date('2026-08-01T08:00:00Z'),
      status: ReminderExecutionStatus.SENT,
      skipReason: null,
      providerMessageId: 'earlier-send',
      failureReason: null,
      createdAt: new Date('2026-08-01'),
    });

    const scheduler = app.get(ReminderSchedulerService);
    await scheduler.scan(new Date('2026-08-03'));

    const executionRepo = app.get<IReminderExecutionRepository>(
      REMINDER_EXECUTION_REPOSITORY,
    );
    const tenantContext = app.get(TenantContextService);
    const executions = await tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      () => executionRepo.findPage({ receivableId, page: 1, limit: 10 }),
    );
    const skipped = executions.items.find(
      (e) => e.status === ReminderExecutionStatus.SKIPPED,
    );
    expect(skipped?.skipReason).toBe(ReminderSkipReason.RATE_LIMITED);
  });

  it('sender records SKIPPED/ALREADY_PAID when the receivable was paid before the fresh-state re-check', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000900';
    const { customerId, token } = await setUpOrg(organizationId);
    await createPolicyWithRule(token, -5, 7);
    const receivableId = await createReceivable(organizationId, customerId, {
      dueDate: new Date('2026-08-08'),
      status: ReceivableStatus.PAID,
    });
    const ruleId = await getRuleId(organizationId);

    const sender = app.get(ReminderSenderService);
    const tenantContext = app.get(TenantContextService);
    await tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      () =>
        sender.send({
          organizationId,
          receivableId,
          reminderRuleId: ruleId,
          executionDate: '2026-08-03',
        }),
    );

    const executionRepo = app.get<IReminderExecutionRepository>(
      REMINDER_EXECUTION_REPOSITORY,
    );
    const executions = await tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      () => executionRepo.findPage({ receivableId, page: 1, limit: 10 }),
    );
    expect(executions.items[0]?.status).toBe(ReminderExecutionStatus.SKIPPED);
    expect(executions.items[0]?.skipReason).toBe(
      ReminderSkipReason.ALREADY_PAID,
    );
    expect(fakeEmailProvider.send).not.toHaveBeenCalled();
  });

  it('sends a reminder end to end: PENDING -> EmailService -> SENT with a providerMessageId', async () => {
    const organizationId = '00000000-0000-4000-8000-001000000000';
    const { customerId, token } = await setUpOrg(organizationId);
    const emailTemplateId = await createEmailTemplate(organizationId);
    await createPolicyWithRule(token, -5, 7, emailTemplateId);
    const receivableId = await createReceivable(organizationId, customerId, {
      dueDate: new Date('2026-08-08'),
    });
    const ruleId = await getRuleId(organizationId);

    const sender = app.get(ReminderSenderService);
    const tenantContext = app.get(TenantContextService);
    await tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      () =>
        sender.send({
          organizationId,
          receivableId,
          reminderRuleId: ruleId,
          executionDate: '2026-08-03',
        }),
    );

    const executionRepo = app.get<IReminderExecutionRepository>(
      REMINDER_EXECUTION_REPOSITORY,
    );
    await waitUntil(async () => {
      const executions = await tenantContext.run(
        { userId: 'system', organizationId, role: Role.OWNER },
        () => executionRepo.findPage({ receivableId, page: 1, limit: 10 }),
      );
      return executions.items[0]?.status === ReminderExecutionStatus.SENT;
    });

    const executions = await tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      () => executionRepo.findPage({ receivableId, page: 1, limit: 10 }),
    );
    expect(executions.items[0]?.providerMessageId).toBeTruthy();
  }, 20_000);

  it('a reminder rule created for one organization is invisible under another organization tenant context', async () => {
    const orgA = '00000000-0000-4000-8000-001100000000';
    const orgB = '00000000-0000-4000-8000-001200000000';
    const { token: tokenA } = await setUpOrg(orgA);
    await setUpOrg(orgB);
    await createPolicyWithRule(tokenA, -5, 7);
    const ruleId = await getRuleId(orgA);

    const tenantContext = app.get(TenantContextService);
    const ruleRepo = app.get<IReminderRuleRepository>(
      'IReminderRuleRepository',
    );
    const ruleUnderWrongOrg = await tenantContext.run(
      { userId: 'system', organizationId: orgB, role: Role.OWNER },
      () => ruleRepo.findById(ruleId),
    );
    expect(ruleUnderWrongOrg).toBeNull();

    const ruleUnderRightOrg = await tenantContext.run(
      { userId: 'system', organizationId: orgA, role: Role.OWNER },
      () => ruleRepo.findById(ruleId),
    );
    expect(ruleUnderRightOrg).not.toBeNull();
  });

  it('updateSendResult does not update a PENDING execution belonging to a different organization', async () => {
    const orgA = '00000000-0000-4000-8000-001300000000';
    const orgB = '00000000-0000-4000-8000-001400000000';
    const { customerId } = await setUpOrg(orgA);
    await setUpOrg(orgB);
    const receivableId = await createReceivable(orgA, customerId);
    const executionId = randomUUID();

    await dataSource.getRepository(ReminderExecutionOrmEntity).save({
      id: executionId,
      organizationId: orgA,
      receivableId,
      reminderRuleId: null,
      executionDate: new Date('2026-08-03'),
      sentAt: null,
      status: ReminderExecutionStatus.PENDING,
      skipReason: null,
      providerMessageId: null,
      failureReason: null,
      createdAt: new Date(),
    });

    const executionRepo = app.get<IReminderExecutionRepository>(
      REMINDER_EXECUTION_REPOSITORY,
    );
    const tenantContext = app.get(TenantContextService);

    await tenantContext.run(
      { userId: 'system', organizationId: orgB, role: Role.OWNER },
      () => executionRepo.updateSendResult(executionId, 'SENT', 'cross-tenant'),
    );
    const stillPending = await dataSource
      .getRepository(ReminderExecutionOrmEntity)
      .findOneBy({ id: executionId });
    expect(stillPending?.status).toBe(ReminderExecutionStatus.PENDING);

    await tenantContext.run(
      { userId: 'system', organizationId: orgA, role: Role.OWNER },
      () => executionRepo.updateSendResult(executionId, 'SENT', 'same-tenant'),
    );
    const nowSent = await dataSource
      .getRepository(ReminderExecutionOrmEntity)
      .findOneBy({ id: executionId });
    expect(nowSent?.status).toBe(ReminderExecutionStatus.SENT);
    expect(nowSent?.providerMessageId).toBe('same-tenant');
  });

  it('marks the execution FAILED after all EmailService retries are exhausted', async () => {
    const organizationId = '00000000-0000-4000-8000-001500000000';
    const { customerId, token } = await setUpOrg(organizationId);
    const emailTemplateId = await createEmailTemplate(organizationId);
    await createPolicyWithRule(token, -5, 7, emailTemplateId);
    const receivableId = await createReceivable(organizationId, customerId, {
      dueDate: new Date('2026-08-08'),
    });
    const ruleId = await getRuleId(organizationId);

    fakeEmailProvider.send
      .mockRejectedValueOnce(new Error('smtp down'))
      .mockRejectedValueOnce(new Error('smtp down'))
      .mockRejectedValueOnce(new Error('smtp down'));

    const sender = app.get(ReminderSenderService);
    const tenantContext = app.get(TenantContextService);
    await tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      () =>
        sender.send({
          organizationId,
          receivableId,
          reminderRuleId: ruleId,
          executionDate: '2026-08-03',
        }),
    );

    const executionRepo = app.get<IReminderExecutionRepository>(
      REMINDER_EXECUTION_REPOSITORY,
    );
    await waitUntil(async () => {
      const executions = await tenantContext.run(
        { userId: 'system', organizationId, role: Role.OWNER },
        () => executionRepo.findPage({ receivableId, page: 1, limit: 10 }),
      );
      return executions.items[0]?.status === ReminderExecutionStatus.FAILED;
    }, 25_000);

    const executions = await tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      () => executionRepo.findPage({ receivableId, page: 1, limit: 10 }),
    );
    expect(executions.items[0]?.status).toBe(ReminderExecutionStatus.FAILED);
    expect(executions.items[0]?.providerMessageId).toBeNull();

    fakeEmailProvider.send.mockReset();
    fakeEmailProvider.send.mockResolvedValue({
      providerMessageId: 'fake-msg-id',
    });
  }, 30_000);

  it('re-matches a receivable in the same scan window after its dispute is resolved', async () => {
    const organizationId = '00000000-0000-4000-8000-001600000000';
    const openedByUserId = '00000000-0000-4000-8000-000000000100';
    const { customerId, token } = await setUpOrg(organizationId);
    const emailTemplateId = await createEmailTemplate(organizationId);
    await createPolicyWithRule(token, -5, 7, emailTemplateId);
    const receivableId = await createReceivable(organizationId, customerId, {
      dueDate: new Date('2026-08-08'),
    });
    const dispute = await dataSource.getRepository(DisputeOrmEntity).save({
      id: randomUUID(),
      organizationId,
      receivableId,
      reason: 'late payment',
      status: DisputeStatus.OPEN,
      openedByUserId,
      resolvedByUserId: null,
      resolvedAt: null,
      createdAt: new Date(),
    });

    const scheduler = app.get(ReminderSchedulerService);
    const executionRepo = app.get<IReminderExecutionRepository>(
      REMINDER_EXECUTION_REPOSITORY,
    );
    const tenantContext = app.get(TenantContextService);

    await scheduler.scan(new Date('2026-08-03'));
    const beforeResolve = await tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      () => executionRepo.findPage({ receivableId, page: 1, limit: 10 }),
    );
    expect(beforeResolve.items).toHaveLength(0);

    await dataSource.getRepository(DisputeOrmEntity).update(dispute.id, {
      status: DisputeStatus.RESOLVED,
      resolvedByUserId: openedByUserId,
      resolvedAt: new Date(),
    });

    await scheduler.scan(new Date('2026-08-03'));

    await waitUntil(async () => {
      const executions = await tenantContext.run(
        { userId: 'system', organizationId, role: Role.OWNER },
        () => executionRepo.findPage({ receivableId, page: 1, limit: 10 }),
      );
      return executions.items.length > 0;
    });

    const afterResolve = await tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      () => executionRepo.findPage({ receivableId, page: 1, limit: 10 }),
    );
    expect(afterResolve.items.length).toBeGreaterThan(0);
    expect(afterResolve.items[0]?.skipReason).not.toBe(
      ReminderSkipReason.DISPUTED,
    );
  }, 20_000);
});
